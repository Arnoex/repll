const {
  moveCursor,
  clearScreenDown,
  cursorTo,
  createInterface,
} = require('readline')
const { stringBleach, wiseUpdate } = require('./utils')
const { EOL, platform } = require('os')
const EventEmitter = require('events')
const CSI = '\x1B['

let rl = null
class replLive extends EventEmitter {
  constructor(prompt = ['› ']) {
    super(
      (() => {
        // Set prompt interface
        rl = createInterface({
          input: process.stdin,
          output: process.stdout,
          prompt: '\n' + prompt[0],
          // Disable tab
          completer: () => [[]],
        })
        rl.prompt()
        rl.input.setEncoding('utf8')

        // Use _previousKey: neither `keypress` nor `data` event
        const handleKey = input => {
          const data = rl['_previousKey']
          this.input = this.fixFakeLine()
          this.emit('any', data)
          // Handle paste(fixed /\n$/ text)
          if (input.length > 1 && !data.code) {
            if (rl.history) {
              this.write(null, { name: 'up' })
              rl.history = []
              rl.historyIndex = -1
            }
            this.refreshInput()
            this.lastLine = this.input
            this.history[this.inputLine - 1] = this.input
            this.emit('key', input)
            return
          }
          const i = `${data.ctrl ? '^' : ''}${data.name}`
          // Register Event: 'arrow' 'complete' 'submit' 'key' 'any' 'shiftEnter'
          switch (i) {
            case '^c':
            case '^d': {
              this.write('\u001B[?25h')
              this.removeAllListeners()
              process.exit()
            }
            // Arrow key
            case /(up|down|left|right)/.test(i) ? i : null: {
              if (i === 'down' && data.shift) {
                this.refresh()
                const cols = process.stdout.columns * this.fakeLineBreak++
                const lineBreak = cols - rl.line.length
                this.lineFake(lineBreak)
                this.emit('fakeLine')
                break
              }
              this.emit(`arrow`, i)
              break
            }
            case '^u': {
              this.refresh()
              break
            }
            case 'tab': {
              this.emit('complete', this.input)
              break
            }
            case 'backspace': {
              // Show placeholder when input gets empty
              if (!rl.line) this.writePlaceholder()
              if (this.fakeLineBreak > 1) {
                rl.line = rl.line.replace(/(\s+↵\s)$/, match => {
                  rl.cursor = rl.line.length - match.length + 1
                  this.fakeLineBreak--
                  return ''
                })
              }
              break
            }
            case 'return': {
              // Disable default arrow up/down
              rl.history = []
              this.prompt(prompt[this.inputLine])
              this.lastLine = ''
              this.fakeLineBreak = 1
              this.emit('line', ++this.inputLine)
              break
            }
            // Can not detect ^return, use ^s instead
            case '^s': {
              rl.write(`${CSI}?25h`)
              this.emit('submit')
              break
            }
            default: {
              this.lastLine = this.input
              if (rl.line.length === 1) this.refreshInput()
              this.emit('key', data.sequence)
            }
          }
          // Set input history livly
          this.history[this.inputLine - 1] = this.input
        }

        process.stdin.on('data', handleKey)
      })()
    )
    // Reserve last time output for less reprint
    this.lastOutput = ''
    // Count input lines
    this.inputLine = 1
    // Export readline instance
    this.rl = rl
    // Faking line break
    this.fakeLineBreak = 1
    // Recording line history
    this.history = []
  }

  write = (string, object) => {
    rl.write(string, object)
    this.refreshInput()
  }
  /**
   * Refresh output
   * inspired by https://github.com/nodejs/node/blob/v15.6.0/lib/readline.js#L403
   * @param {string} string given string to output
   * @param {noEOL} string print output on input line
   */
  refresh = (string = '', noEOL) => {
    // Row is relative to current line, not window
    const { rows, cols } = rl.getCursorPos()
    const out = rl.output
    let mode = []
    if (string) {
      mode = wiseUpdate(this.lastOutput, string)
    } else if (noEOL) {
      mode = [false, true, noEOL]
    } else {
      mode = [true]
    }
    const [del, write, message] = mode
    // Delete last time output
    if (del) {
      moveCursor(out, -cols, rows)
      clearScreenDown(out)
      moveCursor(out, cols, -rows)
    }
    // Write output, Restore cursor
    if (write) {
      if (platform() === 'win32') message.replace(new RegExp(EOL, 'g'), '\n')
      const offsetRows =
        stringBleach(message)
          .split('\n')
          .reduce((rows, e) => {
            return (
              rows + 1 + Math.floor(e.length / (process.stdout.columns + 0.01))
            )
          }, 0) - 1
      out.write(message)
      cursorTo(out, cols)
      moveCursor(out, 0, -offsetRows)
    }
    this.lastOutput = message
  }
  hl = (len, string) => {
    moveCursor(rl.output, -len)
    rl.output.write(string)
  }
  // Write placeholder to stdout
  writePlaceholder(placeholder) {
    this.placeholder = placeholder || this.placeholder || ''
    if (this.placeholder)
      this.refresh(false, `${CSI}90m${this.placeholder}${CSI}39m`)
  }
  // Faking a new line(a bad practice)
  lineFake(len) {
    const prompt = '↵ '
    for (let i = 0; i < len - prompt.length; i++) {
      rl.write(' ')
    }
    rl.write(prompt)
  }
  // Refresh input, clear stdout
  refreshInput() {
    clearScreenDown(rl.output)
  }
  prompt(nextPrompt) {
    if (nextPrompt) {
      rl.setPrompt(`\n${nextPrompt.replace('<hide>', () => `${CSI}?25l`)}`)
    } else {
      rl.setPrompt(`\n${CSI}?25h› `)
    }
    rl.prompt()
  }
  fixFakeLine() {
    const fLine = rl.line
    if (this.fakeLineBreak > 1) return fLine.replace(/\s+↵\s/g, '\n')
    return fLine
  }
}

module.exports = replLive
