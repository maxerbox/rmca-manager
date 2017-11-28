const bluetooth = require('bluetooth-serial-port')
const {ipcMain} = require('electron')
class BluetoothCommunication {
  /**
   * Creates an instance of BluetoothCommunication.
   * @param {BrowserWindow} window
   * @memberof BluetoothCommunication
   */
  constructor (window) {
    this.window = window
    this.btSerial = new bluetooth.BluetoothSerialPort()
    this.devices = new Map()
    this.isFinished = false
    this.isSearching = false
    this.dataMap = {
      temperature: [],
      battery: [],
      direction: []
    }
    this.currentDevice = null
    this.currentChannel = null
    this.parsingDataRegExp = /^(?!\s*#)\s*(\S+)\s*=\s*([^\s#]*)/g
    // setTimeout(() => this.window.webContents.send('bt:found', 'test', 'test'), 1000)
    this.handleEvent()
  }
  start () {
    this.isFinished = false
    this.reset()
    this.isSearching = true
    this.window.webContents.send('bt:searching')
    this.btSerial.inquire()
  }
  /**
   * @private
   * @memberof BluetoothCommunication
   */
  handleEvent () {
    this.btSerial.on('found', (address, name) => {
      this.devices.set(address, {'address': address, 'name': name})
      this.window.webContents.send('bt:found', address, name)
    })
    setInterval(() => this.window.webContents.send('data:received', 'temperature', Math.floor(Math.random() * 24) + 1, Date.now()), 500)
    ipcMain.on('bt:select', this.selectPort.bind(this))
    ipcMain.on('bt:close', this.close.bind(this))
    ipcMain.on('bt:refresh', this.refresh.bind(this))
    ipcMain.on('data:request', this.dataRequest.bind(this))
    this.btSerial.on('data', this.acquireData.bind(this))
    this.btSerial.on('closed', this.close.bind(this))
    this.btSerial.on('failure', this.onFailure.bind(this))
    this.btSerial.on('finished', this.onInquireFinished.bind(this))
  }
  /**
   * @private
   * @param {string} adress
   * @memberof BluetoothCommunication
   */
  selectPort (event, address) {
    console.log('select')
    if (this.devices.has(address)) {
      this.btSerial.findSerialPortChannel(address, channel => {
        this.window.webContents.send('bt:connecting', channel)
        this.btSerial.connect(address, channel, () => {
          this.currentDevice = this.devices.get(address)
          this.currentChannel = channel
          this.window.webContents.send('bt:connected', channel)
        }, () => this.window.webContents.send('bt:error', 'Erreur lors de la connection au port'))
      }, () => this.window.webContents.send('bt:error', 'Aucune liaison série trouvée'))
    }
  }
  /**
   * @private
   * @param {Buffer} buffer
   * @memberof BluetoothCommunication
   */
  acquireData (buffer) {
    var string = buffer.toString('utf-8')
    var receivedTime = Date.now()
    string.replace(this.parsingDataRegExp, (_, key, val) => {
      switch (key) {
        case 'temperature':
          this.addData('temperature', parseInt(val))
          this.window.webContents.send('data:received', 'temperature', parseInt(val), receivedTime)
          break
        case 'battery':
          this.addData('battery', parseInt(val))
          this.window.webContents.send('data:received', 'battery', parseInt(val), receivedTime)
          break
        case 'direction':
          this.addData('direction', parseInt(val))
          this.window.webContents.send('data:received', 'direction', parseInt(val), receivedTime)
          break
        default:
          this.window.webContents.send('bt:invalidData', string)
      }
    })
  }
  /**
   * Add data to dataMap
   * @private
   * @param {string} type
   * @param {any} data
   * @param {int} time
   * @memberof BluetoothCommunication
   */
  addData (type, data, time) {
    if (!this.dataMap[type]) return
    this.dataMap[type].push({value: data, time: time})
  }
  dataRequest () {
    this.window.webContents.send('data:response', this.dataMap)
  }
  /**
   * Close the Bluetooth connection
   * @memberof BluetoothCommunication
   */
  close () {
    if (this.btSerial.isOpen()) {
      this.btSerial.close()
    }
    this.reset()
    this.window.webContents.send('bt:closed')
  }
  reset () {
    this.currentChannel = null
    this.currentDevice = null
    this.isSearching = false
    this.devices = new Map()
  }
  /**
   * @private
   * @memberof BluetoothCommunication
   */
  onFailure () {
    this.window.webContents.send('bt:failure')
    this.close()
  }
  onInquireFinished () {
    this.isSearching = false
    this.isFinished = true
    this.window.webContents.send('bt:finished')
  }
  refresh () {
    this.start()
  }
}
module.exports = BluetoothCommunication
