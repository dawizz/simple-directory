// useful tutorial
// https://medium.com/disney-streaming/setup-a-single-sign-on-saml-test-environment-with-docker-and-nodejs-c53fc1a984c9

const fs = require('fs-extra')
const config = require('config')
const slug = require('slugify')
const samlify = require('samlify')
const validator = require('@authenio/samlify-xsd-schema-validator')

samlify.setSchemaValidator(validator)

exports.idps = {}

exports.getProviderId = (url) => {
  return slug(new URL(url).host, { lower: true, strict: true })
}

exports.init = async () => {
  const cert = (await fs.readFile(config.secret.public)).toString()
  const privateKey = (await fs.readFile(config.secret.private)).toString()
  exports.sp = samlify.ServiceProvider({
    entityID: `${config.publicUrl}/api/auth/saml2-metadata.xml`,
    assertionConsumerService: `${config.publicUrl}/api/auth/saml2-assert`,
    signingCert: cert,
    privateKey,
    encryptCert: cert,
    envPrivateKey: privateKey
  })

  exports.publicProviders = []

  for (const providerConfig of config.saml2.providers) {
    const idp = new samlify.IdentityProvider(providerConfig)
    const id = exports.getProviderId(idp.entitySetting.id)
    if (exports.idps[id]) throw new Error('Duplicate SAML provider id ' + id)
    exports.idps[id] = idp
    exports.publicProviders.push({
      type: 'saml2',
      id,
      title: providerConfig.title,
      color: providerConfig.color,
      icon: providerConfig.icon,
      img: providerConfig.img
    })
  }
}
