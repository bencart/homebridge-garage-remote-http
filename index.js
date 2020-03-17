var Service, Characteristic
const packageJson = require('./package.json')
const request = require('request')

module.exports = function (homebridge) {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-garage-remote-http', 'GarageDoorOpener', GarageDoorOpener)
}

function GarageDoorOpener (log, config) {
  this.log = log

  this.name = config.name

  this.openURL = config.openURL
  this.closeURL = config.closeURL

  this.manufacturer = config.manufacturer || packageJson.author.name
  this.serial = config.serial || packageJson.version
  this.model = config.model || packageJson.name
  this.firmware = config.firmware || packageJson.version

  this.username = config.username || null
  this.password = config.password || null
  this.timeout = config.timeout || 3000
  this.http_method = config.http_method || 'GET'

  this.polling = true
  this.pollInterval = config.pollInterval || 1
  this.statusURL = config.statusURL

  if (this.username != null && this.password != null) {
    this.auth = {
      user: this.username,
      pass: this.password
    }
  }

  this.service = new Service.GarageDoorOpener(this.name)
}

GarageDoorOpener.prototype = {

  identify: function (callback) {
    this.log('Identify requested!')
    callback()
  },

  _httpRequest: function (url, body, method, callback) {
    request({
      url: url,
      body: body,
      method: this.http_method,
      timeout: this.timeout,
      rejectUnauthorized: false,
      auth: this.auth
    },
    function (error, response, body) {
      callback(error, response, body)
    })
  },

  _getStatus: function (callback) {
    var url = this.statusURL
    this.log.debug('Getting status: %s', url)

    this._httpRequest(url, '', 'GET', function (error, response, responseBody) {
      if (error) {
        this.log.warn('Error getting status: %s', error.message)
        this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(new Error('Polling failed'))
        callback(error)
      } else {
        this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(responseBody)
        this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(responseBody)
        this.log('Updated state to: %s', responseBody)
        callback()
      }
    }.bind(this))
  },

  setTargetDoorState: function (value, callback) {
    var url
    this.log.debug('Setting targetDoorState to %s', value)
    if (value === 1) {
      url = this.closeURL
    } else {
      url = this.openURL
    }
    this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
      if (error) {
        this.log.warn('Error setting targetDoorState: %s', error.message)
        callback(error)
      } else {
        if (value === 1) {
          this.log('Started closing')
          this.simulateClose()
        } else {
		      this.log('Started opening')
          this.simulateOpen()
        }
        callback()
      }
    }.bind(this))
  },

  simulateOpen: function () {
    this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(2)
  },

  simulateClose: function () {
    this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(3)
  },

  getServices: function () {
    this.informationService = new Service.AccessoryInformation()
    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serial)
      .setCharacteristic(Characteristic.FirmwareRevision, this.firmware)

    this.service
      .getCharacteristic(Characteristic.TargetDoorState)
      .on('set', this.setTargetDoorState.bind(this))

    if (this.polling) {
      this._getStatus(function () {})

      setInterval(function () {
        this._getStatus(function () {})
      }.bind(this), this.pollInterval * 1000)
    } else {
      this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(1)
      this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(1)
    }

    return [this.informationService, this.service]
  }
}
