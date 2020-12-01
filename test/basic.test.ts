import shellac from '../src'

describe('getting started', () => {
  it('should run a simple command', async () => {
    const { stdout } = await shellac`
      $ echo "Hello, world!" 
    `

    expect(stdout).toBe('Hello, world!')
  })

  it('should run two simple commands', async () => {
    const { stdout } = await shellac`
      $ echo "Hello, world!"
      $ echo "If there's one thing JavaScript has been lacking, it's DSLs."
    `

    expect(stdout).toBe(`If there's one thing JavaScript has been lacking, it's DSLs.`)
  })
})
