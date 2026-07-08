// Express 4 não captura rejeições de handlers async — este wrapper encaminha
// qualquer erro para o middleware de erro via next(err).
export const ah = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
