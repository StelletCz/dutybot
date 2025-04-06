const axios = require('axios');
require('dotenv').config();

const BIN_ID = process.env.JSONBIN_BIN_ID;
const API_KEY = process.env.JSONBIN_API_KEY;

const headers = {
    'Content-Type': 'application/json',
    'X-Master-Key': API_KEY
};

async function loadUsers() {
    const res = await axios.get(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, { headers });
    return res.data.record.users || {};
}

async function saveUsers(users) {
    const res = await axios.put(`https://api.jsonbin.io/v3/b/${BIN_ID}`, { users }, { headers });
    return res.data;
}

module.exports = { loadUsers, saveUsers };
