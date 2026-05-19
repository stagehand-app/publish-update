import { run } from './main.js'

run().catch((err: unknown) => {
  process.exitCode = 1
  console.error(err)
})
