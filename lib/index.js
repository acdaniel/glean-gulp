var crypto = require('crypto');
var glean = require('glean');
var path = require('path');
var fs = require('node-fs');
var es = require('event-stream');
var gutil = require('gulp-util');
var _ = require('lodash-node');
var q = require('q');
var PluginError = gutil.PluginError;

const PLUGIN_NAME = 'glean-gulp';

module.exports = function (options) {
  var assets = {};
  options = options || {};
  _.defaults(options, {
    registry: null,
    https: false,
    host: 'localhost',
    prefix: '',
    cacheBust: true
  });

  if (!options.registry) {
    throw new PluginError(PLUGIN_NAME, 'Registry option is required');;
  }

  // creating a stream through which each file will pass
  var stream = es.map(function (file, cb) {
    var ext = path.extname(file.path);
    if (!options[ext]) {
      throw new PluginError(PLUGIN_NAME, 'No configuration found for type ' + ext);;
    }
    if (!_.isFunction(options[ext].processor)) {
      throw new PluginError(PLUGIN_NAME, 'Invalid processor for type ' + ext);;      
    }
    q.nfcall(options[ext].processor, file.path, options[ext])
      .then(function (contents) {
        var origRelative = '/' + file.relative;
        if (options[ext].ext) {
          origRelative = origRelative.substr(0, origRelative.length - ext.length) + options[ext].ext;
        }
        if (options.cacheBust) {
          var md5 = crypto.createHash('md5').update(contents).digest('hex');
          file.path = file.path.substr(0, file.path.length - ext.length) + 
          '-' + md5 + (options[ext].ext || ext);
        } 
        assets[origRelative] = 
          (options.https ? 'https' : 'http') +
          '://' + options.host +
          options.prefix + '/' + file.relative;
        file.contents = new Buffer(contents);
        return cb(null, file);
      })
      // catch any errors
      .fail(function (err) {
        return cb(err);
      })
      .done();
  });

  // when the stream is done, write the asset registry file
  stream.on('end', function () {
    q.nfcall(fs.mkdir, path.dirname(options.registry), 077, true)
      .then(function () {
        return q.nfcall(fs.writeFile, options.registry, JSON.stringify(assets));
      })
      .fail(function (err) {
        throw err;
      });
  });

  // returning the file stream
  return stream;
};