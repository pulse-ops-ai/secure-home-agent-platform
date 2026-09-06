export const rejected = (): Promise<never> => Promise.reject(new Error('bad'))
