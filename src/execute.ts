import { ExecResult, ParsedToken, ParseResult, ExecutionContext } from './types'
import ShellCommand from './child-subshell/command'
import { trimFinalNewline } from './child-subshell/utils'

async function IfStatement(chunk: ParsedToken, context: ExecutionContext) {
  const { interps, last_cmd } = context
  const [[val_type, val_id], if_clause, else_clause] = chunk
  // console.log({val_type, val_id, if_clause, else_clause})
  if (val_type !== 'VALUE')
    throw new Error(
      'If statements only accept value interpolations, not functions.'
    )

  // @ts-ignore
  if (interps[val_id]) {
    // console.log("IF STATEMENT IS TRUE")
    return execute(if_clause, context)
  } else if (else_clause) {
    // console.log("IF STATEMENT IS FALSE")
    return execute(else_clause, context)
  } else {
    return last_cmd
  }
}

async function Command(chunk: ParsedToken, context: ExecutionContext) {
  const { interps, cwd, shell, exit_expected } = context
  const [str] = chunk as string[]
  // @ts-ignore
  const split_cmd = str.split(/#__(?:FUNCTION|VALUE)_(\d+)__#/g)
  let cmd = ''
  let i = 0
  for (const token of split_cmd) {
    if (i++ % 2 === 0) {
      cmd += token
    } else {
      // @ts-ignore
      const interp = interps[token]
      cmd += await (typeof interp === 'function' ? interp() : interp)
    }
  }
  const command = new ShellCommand({
    cwd,
    shell,
    cmd,
    pipe_logs: chunk.tag === 'logged_command',
    exit_expected,
  })
  return command.run()
}

async function InStatement(chunk: ParsedToken, context: ExecutionContext) {
  const { interps } = context
  const [[val_type, val_id], in_clause] = chunk
  if (val_type !== 'VALUE')
    throw new Error(
      'IN statements only accept value interpolations, not functions.'
    )

  // @ts-ignore
  const new_cwd = interps[val_id]
  if (!new_cwd || typeof new_cwd !== 'string')
    throw new Error(
      `IN statements need a string value to set as the current working dir`
    )
  return execute(in_clause, {
    ...context,
    cwd: new_cwd,
  })
}

async function Grammar(chunk: ParsedToken, context: ExecutionContext) {
  const { last_cmd } = context
  let new_last_cmd = last_cmd
  for (const sub of chunk) {
    new_last_cmd = await execute(sub, {
      ...context,
      last_cmd: new_last_cmd,
    })
  }
  return new_last_cmd
}

async function Await(chunk: ParsedToken, context: ExecutionContext) {
  const { interps, last_cmd } = context
  const [[val_type, val_id]] = chunk
  if (val_type !== 'FUNCTION')
    throw new Error(
      'IN statements only accept function interpolations, not values.'
    )

  // @ts-ignore
  await interps[val_id]()
  return last_cmd
}

async function Stdout(chunk: ParsedToken, context: ExecutionContext) {
  const { interps, last_cmd, captures } = context
  const [out_or_err, second] = chunk

  if (!(out_or_err === 'stdout' || out_or_err === 'stderr'))
    throw new Error(`Expected only 'stdout' or 'stderr', got: ${out_or_err}`)
  const capture = trimFinalNewline(last_cmd?.[out_or_err] || '')

  // @ts-ignore
  const tag: string = second.tag
  if (tag === 'identifier') {
    const [val_type, val_id] = second
    if (val_type !== 'FUNCTION')
      throw new Error(
        'STDOUT/STDERR statements only accept function interpolations, not values.'
      )

    // @ts-ignore
    await interps[val_id](capture)
  } else if (tag === 'variable_name') {
    captures[second[0] as string] = capture
  } else {
    throw new Error(
      'STDOUT/STDERR statements expect a variable name or an interpolation function.'
    )
  }
  return last_cmd
}

async function Exitcode(chunk: ParsedToken, context: ExecutionContext) {
  const { interps, last_cmd } = context
  const [exitcode, second] = chunk

  if (exitcode !== 'exitcode')
    throw new Error(`Expected only 'exitcode', got: ${exitcode}`)
  const capture = last_cmd?.retCode || 0

  // @ts-ignore
  const tag: string = second.tag
  if (tag === 'identifier') {
    const [val_type, val_id] = second
    if (val_type !== 'FUNCTION')
      throw new Error(
        'exitcode statements only accept function interpolations, not values.'
      )

    // @ts-ignore
    await interps[val_id](capture)
  } else {
    throw new Error('exitcode statements expect an interpolation function.')
  }
  return last_cmd
}

async function ExitsStatement(chunk: ParsedToken, context: ExecutionContext) {
  const [exit_expected, block] =
    chunk.length > 1 ? [Number(chunk[0][0]), chunk[1]] : [true, chunk[0]]
  // const [[val_type, val_id], in_clause] = chunk
  // if (val_type !== 'VALUE')
  //   throw new Error(
  //     'IN statements only accept value interpolations, not functions.'
  //   )
  //
  return execute(block, {
    ...context,
    exit_expected,
  })
}

export const execute = async (
  chunk: ParseResult,
  context: ExecutionContext
): Promise<ExecResult> => {
  // console.log({ chunk })
  if (Array.isArray(chunk)) {
    if (chunk.tag === 'command_line' || chunk.tag === 'logged_command') {
      return Command(chunk, context)
    } else if (chunk.tag === 'if_statement') {
      return IfStatement(chunk, context)
    } else if (chunk.tag === 'in_statement') {
      return InStatement(chunk, context)
    } else if (chunk.tag === 'grammar') {
      return await Grammar(chunk, context)
    } else if (chunk.tag === 'await_statement') {
      return await Await(chunk, context)
    } else if (chunk.tag === 'stdout_statement') {
      return await Stdout(chunk, context)
    } else if (chunk.tag === 'exitcode_statement') {
      return await Exitcode(chunk, context)
    } else if (chunk.tag === 'exits_statement') {
      return await ExitsStatement(chunk, context)
    } else {
      return context.last_cmd
    }
  }

  return null
}
