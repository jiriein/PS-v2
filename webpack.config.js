const webpack = require('webpack');

module.exports = {
  resolve: {
    fallback: {
      fs: false, // Disable fs for browser (handled by Capacitor in native)
      util: require.resolve('util/'),
      stream: require.resolve('stream-browserify'),
      path: require.resolve('path-browserify'),
      zlib: require.resolve('browserify-zlib'),
      assert: require.resolve('assert/')
    }
  },
  plugins: [
    // Provide global Buffer for libraries expecting it
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer']
    })
  ]
};