const path = require('path');

module.exports = {
  mode: 'production',
  target: 'web',
  entry: path.resolve(__dirname, 'src/index.js'),
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
};
