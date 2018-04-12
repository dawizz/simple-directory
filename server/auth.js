const fs = require('fs')
const path = require('path')
const express = require('express')
const jwt = require('jsonwebtoken')
const util = require('util')
const asyncWrap = require('./utils/async-wrap')
const userName = require('./utils/user-name')

const config = require('config')
const privateKey = fs.readFileSync(path.join(__dirname, '..', config.secret.private))
const publicKey = fs.readFileSync(path.join(__dirname, '..', config.secret.public))

const mapOrganization = (user) => (organization) => ({
  id: organization.id,
  role: organization.members.find(m => m.id === user.id).role,
  name: organization.name
})

let router = express.Router()

// Either find or create an user based on an email address then send a mail with a link and a token
// to check that this address belongs to the user.
router.post('/passwordless', asyncWrap(async (req, res, next) => {
  if (!req.body || !req.body.email) return res.sendStatus(400)
  const user = await req.app.get('storage').getUserByEmail(req.body.email)
  if (!user) return res.sendStatus(404)
  const organizations = await req.app.get('storage').getUserOrganizations(user.id)
  const payload = {
    id: user.id,
    email: req.body.email,
    name: userName(user),
    organizations: organizations.map(mapOrganization(user))
  }
  if (user.isAdmin) payload.isAdmin = true
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: config.jwt.expiresIn,
    keyid: config.kid
  })
  if (req.query.redirect) {
    // res.redirect(req.query.redirect + token)
    res.send(req.query.redirect + token)
  } else {
    res.cookie('id_token', token)
    res.send(token)
  }
}))

// Used to extend an older but still valid token from a user or to validate a passwordless id_token
router.post('/exchange', asyncWrap(async (req, res, next) => {
  const idToken = (req.cookies && req.cookies.id_token) || (req.headers && req.headers.authorization && req.headers.authorization.split(' ').pop())
  if (!idToken) {
    return res.status(401).send('No id_token cookie provided')
  }
  let decoded
  try {
    decoded = await util.promisify(jwt.verify)(idToken, publicKey)
  } catch (err) {
    return res.status(401).send('Invalid id_token')
  }
  delete decoded.iat
  delete decoded.exp

  // User may have new organizations since last renew
  const organizations = await req.app.get('storage').getUserOrganizations(decoded.id)
  decoded.organizations = organizations.map(mapOrganization(decoded))

  const token = jwt.sign(decoded, privateKey, {
    algorithm: 'RS256',
    expiresIn: config.jwt.expiresIn,
    keyid: config.kid
  })
  res.cookie('id_token', token)
  res.send(token)
}))

module.exports = router
