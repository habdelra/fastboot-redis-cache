'use strict';

const expect = require('chai').expect;
const RedisCache = require('../index');

let cache;
let mockRedis = {};

describe('caching tests', function() {

  describe('basic tests', function() {
    beforeEach(function() {
      cache = new RedisCache({
      });
      cache.client = mockRedisClient();
      cache.connected = true;
      mockRedis = {};
    });

    it('can put a response in the cache', function() {
      let body = '<body>Hola</body>';

      return cache.put('/', body).then(() => {
        expect(mockRedis['/']).to.equal(body);
      });
    });

    it('can retreive a response from the cache', function() {
      let body = '<body>Hola</body>';
      mockRedis['/yellow'] = body;

      return cache.fetch('/yellow').then(actual => {
        expect(actual).to.equal(body);
      });
    });

    it('can put a response in the cache for success responses', function() {
      let body = '<body>Hola</body>';
      let mockResponse = { statusCode: 200 };

      return cache.put('/', body, mockResponse).then(() => {
        expect(mockRedis['/']).to.equal(body);
      });
    });

    it('does not cache 5xx error responses', function() {
      let body = '<body>OMG there are so many errors</body>';
      let mockResponse = { statusCode: 500 };

      return cache.put('/', body, mockResponse).then(() => {
        expect(mockRedis['/']).to.be.undefined;
      });
    });

    it('does not cache 4xx error responses', function() {
      let body = '<body>You can`t</body>';
      let mockResponse = { statusCode: 400 };

      return cache.put('/', body, mockResponse).then(() => {
        expect(mockRedis['/']).to.be.undefined;
      });
    });
  });

  describe('custom keys tests', function() {
    beforeEach(function() {
      cache = new RedisCache({
        cacheKey (path, request) {
          return `${request.hostname}${path}_${request && request.cookies && request.cookies.chocolateChip}`;
        }
      });
      cache.client = mockRedisClient();
      cache.connected = true;
      mockRedis = {};
    });

    it('can build a custom cache key from the request object', function() {
      let body = '<body>Hola</body>';
      let mockResponse = {
        req: {
          hostname: 'foo.com',
          cookies: {
            chocolateChip: 'mmmmmm'
          }
        }
      };

      return cache.put('/', body, mockResponse).then(() => {
        expect(mockRedis['foo.com/_mmmmmm']).to.equal(body);
        expect(mockRedis['key_index_/']).to.equal(JSON.stringify(['foo.com/_mmmmmm']));
      });
    });

    it('can represent mulitple cache keys from different domains with the same path', function() {
      let body = '<body>Hola</body>';
      let body2 = '<body>Bonjour</body>';
      let mockResponse = {
        req: {
          hostname: 'foo.com',
          cookies: {
            chocolateChip: 'mmmmmm'
          }
        }
      };
      let mockResponse2 = {
        req: {
          hostname: 'bar.com',
          cookies: {
            chocolateChip: 'mmmmmm'
          }
        }
      };

      return cache.put('/', body, mockResponse)
      .then(() => {
        expect(mockRedis['foo.com/_mmmmmm']).to.equal(body);
        expect(mockRedis['key_index_/']).to.equal(JSON.stringify(['foo.com/_mmmmmm']));
      })
      .then(() => cache.put('/', body2, mockResponse2))
      .then(() => {
        expect(mockRedis['foo.com/_mmmmmm']).to.equal(body);
        expect(mockRedis['bar.com/_mmmmmm']).to.equal(body2);
        expect(mockRedis['key_index_/']).to.equal(JSON.stringify([
          'foo.com/_mmmmmm',
          'bar.com/_mmmmmm'
        ]));
      });
    });

    it('can handle non-JSON keys (migration test)', function() {
      mockRedis[`key_index_/`] = 'garbage_key';
      let body = '<body>Hola</body>';
      let mockResponse = {
        req: {
          hostname: 'foo.com',
          cookies: {
            chocolateChip: 'mmmmmm'
          }
        }
      };

      return cache.put('/', body, mockResponse)
      .then(() => {
        expect(mockRedis['foo.com/_mmmmmm']).to.equal(body);
        expect(mockRedis['key_index_/']).to.equal(JSON.stringify([
          'garbage_key',
          'foo.com/_mmmmmm'
        ]));
      });
    });

    it('can build a custom cache key from the documentId prefix', function() {
      let body = '<body>Hola</body>';
      let mockResponse = {
        req: {
          hostname: 'foo.com',
          cookies: {
            chocolateChip: 'mmmmmm'
          }
        }
      };

      return cache.put('/123-abc', body, mockResponse).then(() => {
        expect(mockRedis['foo.com/123-abc_mmmmmm']).to.equal(body);
        expect(mockRedis.key_index_123).to.equal(JSON.stringify(['foo.com/123-abc_mmmmmm']));
      });
    });

    it('can get a cache item based on a custom cache key', function() {
      let body = '<body>Hola</body>';
      let cookieValue = 'mmmmmm';
      mockRedis[`foo.com/_${cookieValue}`] = body;
      let mockRequest = {
        hostname: 'foo.com',
        cookies: {
          chocolateChip: cookieValue
        }
      };

      return cache.fetch('/', mockRequest).then(actual => {
        expect(actual).to.equal(body);
      });
    });

  });
});

function mockRedisClient() {
  let next = () => {
    return {
      set(key, value) {
        mockRedis[key] = value;
        return next();
      },
      expire() {
        return next();
      },
      exec(callback) {
        callback();
      }
    };
  };

  return {
    on() {
    },

    get(key, callback) {
      return callback(null, mockRedis[key]);
    },

    multi() {
      return next();
    }
  };
}
