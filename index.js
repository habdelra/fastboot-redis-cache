'use strict';

const redis = require('redis');

const FIVE_MINUTES = 5 * 60;
const ONE_HOUR = 12 * FIVE_MINUTES;

class RedisCache {
  constructor(options) {
    let client = this.client = redis.createClient({
      host: options.host,
      port: options.port
    });

    this.expiration = options.expiration || FIVE_MINUTES;
    this.connected = false;
    this.cacheKey = typeof options.cacheKey === 'function' ?
      options.cacheKey : (path) => path;

    client.on('error', error => {
      this.ui.writeLine(`redis error; err=${error}`);
    });

    this.client.on('connect', () => {
      this.connected = true;
      this.ui.writeLine('redis connected');
    });

    this.client.on('end', () => {
      this.connected = false;
      this.ui.writeLine('redis disconnected');
    });
  }

  fetch(path, request) {
    if (!this.connected) { return; }

    let key = this.cacheKey(path, request);

    return new Promise((res, rej) => {
      this.client.get(key, (err, reply) => {
        if (err) {
          rej(err);
        } else {
          res(reply);
        }
      });
    });
  }

  put(path, body, response) {
    if (!this.connected) { return; }

    let request = response && response.req;
    let key = this.cacheKey(path, request);
    let documentIdMatch = /\/([\d]+)/.exec(path);
    let documentId = documentIdMatch && documentIdMatch.length ? documentIdMatch[1] : null;

    return new Promise((res, rej) => {
      let statusCode = response && response.statusCode;
      let statusCodeStr = statusCode && (statusCode + '');
      let keyIndex = `key_index_${documentId || path}`;

      if (statusCodeStr && statusCodeStr.length &&
         (statusCodeStr.charAt(0) === '4' || statusCodeStr.charAt(0) === '5')) {
        res();
        return;
      }

      this.client.get(keyIndex, (err, reply) => {
        if (err) {
          rej(err);
        } else {
          let keys;
          if (!reply) {
            keys = [];
          } else {
            try {
              keys = JSON.parse(reply);
            } catch (e) {
              console.error(`can't parse key index for ${keyIndex}: ${reply}`);
              keys = [ reply ];
            }
          }

          keys.push(key);

          console.log(`Creating cache key ${key}`);
          console.log(`Setting cache key-index ${keyIndex}: ${JSON.stringify(keys)}`);

          this.client.multi()
            .set(key, body)
            .set(keyIndex, JSON.stringify(keys))
            .expire(key, this.expiration)
            .expire(keyIndex, ONE_HOUR)
            .exec(err => {
              if (err) {
                rej(err);
              } else {
                res();
              }
            });
        }
      });
    });
  }
}

module.exports = RedisCache;
