/**
 * Shared control classes.
 *
 * Kept out of Field.jsx because react-refresh requires a component module to
 * export only components.
 */
export const controlClass = (error) => `reg-control ${error ? 'is-invalid' : ''}`;
