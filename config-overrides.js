const webpack = require('webpack');

module.exports = function override(config) {
  const fallback = {
    "crypto": require.resolve("crypto-browserify"),
    "stream": require.resolve("stream-browserify"),
    "assert": require.resolve("assert"),
    "http": require.resolve("stream-http"),
    "https": require.resolve("https-browserify"),
    "os": require.resolve("os-browserify/browser"),
    "path": require.resolve("path-browserify"),
    "zlib": require.resolve("browserify-zlib"),
    "url": require.resolve("url"),
    "buffer": require.resolve("buffer"),
    "process": require.resolve("process/browser"),
    "fs": false,
    "net": false,
    "tls": false,
  };

  config.resolve.fallback = {
    ...(config.resolve.fallback || {}),
    ...fallback
  };

  config.plugins = (config.plugins || []).concat([
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    })
  ]);

  config.ignoreWarnings = [
    /Failed to parse source map/,
    /Critical dependency: the request of a dependency is an expression/
  ];

  return config;
}; 