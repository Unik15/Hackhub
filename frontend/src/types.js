/**
 * These are JSDoc typedefs, not compiled TypeScript. They give you real
 * autocomplete + type-checking in VS Code (and via `tsc --checkJs` if you
 * ever wire that into CI) without renaming files to .tsx or adding a
 * type-checking build step — safer to drop into an existing JS codebase.
 *
 * If you want full TypeScript later: rename files to .tsx/.ts, add
 * `typescript` + `@types/react` + `@types/react-dom` to devDependencies,
 * generate a tsconfig.json (`tsc --init`), and change these typedefs into
 * real `interface`/`type` exports — the shapes below translate 1:1.
 */

/**
 * @typedef {Object} TimelineStep
 * @property {string} label
 * @property {string} [date]
 * @property {boolean} [done]
 */

/**
 * @typedef {Object} Organizer
 * @property {string} name
 * @property {string} [email]
 */

/**
 * @typedef {Object} Hackathon
 * @property {string} id
 * @property {string} title
 * @property {string} [url]
 * @property {string} [platform]
 * @property {string} [location]
 * @property {string} [startDate]  ISO date string
 * @property {string} [endDate]    ISO date string
 * @property {string} [description]
 * @property {number} [participantsCount]
 * @property {TimelineStep[]} [timeline]
 * @property {Organizer} [organizer]
 * @property {string} [organizerName]
 * @property {string} [organizerEmail]
 */

/**
 * @typedef {Object} Participant
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} college
 * @property {string} hackathon_id
 * @property {"pending"|"accepted"|"rejected"} [status]
 */

/**
 * @typedef {Object} SubmitHackathonPayload
 * @property {string} title
 * @property {string} url
 * @property {string} location
 * @property {string} startDate
 * @property {string} endDate
 * @property {string} organizerEmail
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} [college]
 * @property {string} [avatarUrl]
 */

/**
 * @typedef {Object} AuthResponse
 * @property {boolean} success
 * @property {User} [user]
 * @property {string} [message]
 */

export {};
