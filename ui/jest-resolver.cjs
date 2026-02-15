// Custom resolver to handle .js extensions in ES modules
const jestResolve = require('jest-resolve');

module.exports = (request, options) => {
  // If the request doesn't have a file extension, try to resolve it with .js
  if (!/\.(js|json|ts|tsx|mjs)$/.test(request)) {
    try {
      return jestResolve(request + '.js', options);
    } catch (e) {
      // If that fails, try the original request
      return jestResolve(request, options);
    }
  }

  // For requests with .js extension, try to resolve them directly
  if (request.endsWith('.js')) {
    try {
      return jestResolve(request, options);
    } catch (e) {
      // If direct resolution fails, try without the extension
      try {
        return jestResolve(request.replace(/\.js$/, ''), options);
      } catch (e2) {
        // Throw the original error
        throw e;
      }
    }
  }

  return jestResolve(request, options);
};