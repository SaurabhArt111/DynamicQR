export const routes = {
  landing: '/',
  login: '/login',
  adminRoot: '/',
  dashboard: '/',
  modules: '/modules',
  collections: '/collections',
  collection: (id = ':id') => `/collections/${id}`,
  qrcodes: '/qrcodes',
  qrcode: (id = ':id') => `/qrcodes/${id}`,
  files: '/files',
  recycleBin: '/recycle-bin',
  settings: '/settings'
};
