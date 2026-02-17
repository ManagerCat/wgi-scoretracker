/**
 * @typedef {Object} ScoreData
 * @property {Event} name - key is event name, value is Event object
 */

/**
 * @typedef {Object} Event
 * @property {string} recap - URL to the recap page (legacy shape)
 * @property {string} date - ISO Date string of the event (legacy shape)
 */

/**
 * @typedef {Object} RecapGroup
 * @property {string} name - group name
 * @property {number[]} captions - numeric caption scores (parsed)
 * @property {number} subtotal
 * @property {number} total
 */

/**
 * @typedef {Object} Recap
 * @description Processed recap shape: `groups` contain numeric scores.
 * @property {string} division
 * @property {string[]} captions - caption labels (strings)
 * @property {RecapGroup[]} groups - processed groups with numeric captions
 */

/**
 * Raw recap shapes (before numeric parsing)
 * @typedef {Object} RawRecapGroup
 * @property {string} name
 * @property {string[]} captions - caption score strings (unparsed)
 * @property {string} subtotal
 * @property {string} total
 */

/**
 * @typedef {Object} RawRecap
 * @property {string} division
 * @property {string[]} captions - caption labels
 * @property {RawRecapGroup[]} groups - groups with string scores
 */

/**
 * @typedef {Object} CircuitEvent
 * @property {string} name
 * @property {Date} date
 * @property {Recap[]} recaps
 * @property {string} circuit
 */

/**
 * @typedef {CircuitEvent[]} CircuitEventArray
 */
