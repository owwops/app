// THE ONLY FILE YOU EDIT ON GITHUB for a new installation. Everything else stays as it is.
window.OWW_CONFIG = {
  // ONE branch: the address of its Apps Script Web app (Apps Script > Deploy > Manage deployments). It ends with /exec
  URL: 'https://script.google.com/macros/s/AKfycbwHgE9hn3bGaLbIUdso-jGY4eQ0MaH26pZv4ulekX0oj334hqssXy-HdZTnsR4SfFs4lQ/exec',

  // SEVERAL branches: fill this list instead (the login screen then shows a "Branch" choice and remembers it). Leave [] for a single branch.
  // BRANCHES: [ { id: 'BR001', name: 'Viareggio', url: 'https://script.google.com/macros/s/.../exec' }, { id: 'BR002', name: 'Pisa', url: 'https://script.google.com/macros/s/.../exec' } ],
  BRANCHES: [],

  // OWNER app only: the address of the central Owner script (Owner sheet > Deploy > Web app). Leave '' if there is no Owner app.
  OWNER_URL: '',

  // OPTIONAL: your OneSignal App ID, for phone notifications. Leave '' to keep notifications off.
  PUSH_APP_ID: '8f85a578-2bf7-4877-bb89-2387e708c81f'
};
