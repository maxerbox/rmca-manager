const bluetooth = require('bluetooth-serial-port')
const {ipcMain} = require('electron')
const {status} = require('./Constants')
const ChunkParser = require('chunk2json')
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
    this.currentStatus = status.BT_AWAITING
    this.isFinished = false
    this.isSearching = false
    this.dataMap = {
      temperature: [],
      battery: [],
      direction: []
    }
    this.parser = new ChunkParser()
    this.parser.on('json', this.jsonReceived.bind(this))
    this.currentDevice = null
    this.currentChannel = null
    this.parsingDataRegExp = /^(?!\s*#)\s*(\S+)\s*=\s*([^\s#]*)/g
    // setTimeout(() => this.window.webContents.send('bt:found', 'test', 'test'), 1000)
    this.statusInterval = setInterval(this.sendStatus.bind(this), 1000)
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
    ipcMain.on('bt:select', this.selectPort.bind(this))
    ipcMain.on('bt:close', this.close.bind(this))
    ipcMain.on('bt:refresh', this.refresh.bind(this))
    ipcMain.on('data:request', this.dataRequest.bind(this))
    ipcMain.on('robot:control', (e, valeur) => this.btSerial.write(new Buffer(JSON.stringify({type: 'commande', data: parseFloat(valeur)})), () => {}))
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
          this.currentStatus = status.BT_CONNECTED
         // setInterval(this.btSerial.write(new Buffer(JSON.stringify({type: 'commande', data: parseFloat(1)}) + '\n')), 1000)
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
    this.parser.consume(buffer)
  }
  jsonReceived (json) {
    var object = JSON.parse(json)
    var receivedTime = Date.now()
    switch (object.type) {
      case 'temperature':
        var temp = parseFloat(object.data)
        this.addData('temperature', temp)
        this.window.webContents.send('data:received', 'temperature', temp, receivedTime)
        break
    }
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
  sendStatus () {
    this.window.webContents.send('bt:status', this.currentStatus)
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
    this.currentStatus = status.BT_FAILED
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
