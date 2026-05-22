// CJS shim for jest — uuid v10+ is ESM-only.
'use strict'
const crypto = require('crypto')
const v4 = () => crypto.randomUUID()
module.exports = { v4 }
