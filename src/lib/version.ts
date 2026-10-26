export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const APP_BUILD: { commit: string; date: string } = typeof __APP_BUILD__ === 'object' ? __APP_BUILD__ : { commit: 'dev', date: '' };
