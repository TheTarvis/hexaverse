import { consola } from 'consola';

// Configure consola for the application
export const logger = consola.create({
  level: 1,//process.env.NODE_ENV === 'development' ? 4 : 2, // debug in dev, info+ in prod
  formatOptions: {
    colors: true,
    compact: false,
    date: true,
  },
});

export default logger; 