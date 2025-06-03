import { consola } from 'consola';

// Configure consola for the application
export const logger = consola.create({
  level: 2, //1 = error, 2 = warn, 3 = info, 4 = debug.
  formatOptions: {
    colors: true,
    compact: false,
    date: true,
  },
});

export default logger; 