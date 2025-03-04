const config = require('config')
const debug = require('debug')('locks')

let pid

debug('locks with pid', pid)

let interval
exports.init = async db => {
  pid = (await import('nanoid')).nanoid()
  const locks = db.collection('locks')
  await locks.createIndex({ pid: 1 })
  try {
    await locks.createIndex({ updatedAt: 1 }, { expireAfterSeconds: config.locks.ttl })
  } catch (err) {
    console.log('Failure to create TTL index. Probably because the value changed. Try to update it.')
    db.command({ collMod: 'locks', index: { keyPattern: { updatedAt: 1 }, expireAfterSeconds: config.locks.ttl } })
  }

  // prolongate lock acquired by this process while it is still active
  interval = setInterval(() => {
    locks.updateMany({ pid }, { $currentDate: { updatedAt: true } })
  }, (config.locks.ttl / 2) * 1000)
}

exports.stop = async (db) => {
  clearInterval(interval)
  await db.collection('locks').deleteMany({ pid })
}

exports.acquire = async (db, _id) => {
  debug('acquire', _id)
  const locks = db.collection('locks')
  try {
    await locks.insertOne({ _id, pid })
    try {
      await locks.updateOne({ _id }, { $currentDate: { updatedAt: true } })
    } catch (err) {
      await locks.deleteOne({ _id, pid })
      throw err
    }
    debug('acquire ok', _id)
    return true
  } catch (err) {
    if (err.code !== 11000) throw err
    // duplicate means the lock was already acquired
    debug('acquire ko', _id)
    return false
  }
}

exports.release = async (db, _id) => {
  debug('release', _id)
  await db.collection('locks').deleteOne({ _id, pid })
}
