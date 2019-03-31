const throat = require('throat')
const execa = require('execa')
const jestResult = require('./jest-result')
const fs = require('fs-extra')
const tempy = require('tempy')

const removeOutput = file => fs.remove(file).catch(() => {})

class TestRunner {
  constructor(globalConfig) {
    this._globalConfig = globalConfig
  }

  async runTests(tests, watcher, onStart, onResult, onFailure, options) {
    const mutex = throat(this._globalConfig.maxWorkers)
    return Promise.all(
      tests.map(test =>
        mutex(async () => {
          if (watcher.isInterrupted()) {
            throw new CancelRun()
          }

          await onStart(test)

          return this._runTest(
            test.path,
            test.context.config,
            test.context.resolver
          )
            .then(result => onResult(test, result))
            .catch(error => onFailure(test, error))
        })
      )
    )
  }

  async _runTest(testPath, projectConfig, resolver) {
    if (this._globalConfig.updateSnapshot === 'all') {
      const { stdout, stderr } = await execa('py.test', ['-vv', '--snapshot-update'])
      console.error(stderr)
      console.log(stdout)
    }
    const outfile = tempy.file({ extension: 'jest-pytest.json' })
    if (process.env['JEST_PYTEST_DEBUG_IPC']) {
      console.log('file:', outfile)
    }
    const { stdout, stderr } = await execa('py.test', [
      '-vv',
      '--jest-report',
      `--jest-report-file=${outfile}`,
      testPath
    ]).catch(err => {
      if (process.env['JEST_PYTEST_DEBUG_IPC']) {
        console.log('py.test error:', err)
      }
      return err
    }) // all communication happen through files, we swallow exit(1)'s.
    console.log(stdout)
    console.error(stderr)
    try {
      const result = JSON.parse(await fs.readFile(outfile))
      await removeOutput(outfile)
      return jestResult({ ...result, testPath })
    } catch (error) {
      return Promise.reject(error + '\n\nPytest output:\n\n' + res)
    } finally {
    }
  }
}

class CancelRun extends Error {
  constructor(message) {
    super(message)
    this.name = 'CancelRun'
  }
}

module.exports = TestRunner
