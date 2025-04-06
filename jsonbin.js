// jsonbin.js
require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.JSONBIN_API_KEY;
const BIN_ID = process.env.JSONBIN_BIN_ID;
const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

const headers = {
  'Content-Type': 'application/json',
  'X-Master-Key': API_KEY
};

async function loadUsers() {
  try {
    const response = await axios.get(API_URL, { headers });
    return response.data.record;
  } catch (error) {
    console.error("❌ Chyba při načítání dat z JSONBin:", error.response?.data || error.message);
    return {};
  }
}

async function saveUsers(data) {
  try {
    await axios.put(API_URL, data, { headers });
    console.log("💾 Uživatelé úspěšně uloženi do JSONBin.");
  } catch (error) {
    console.error("❌ Chyba při ukládání dat do JSONBin:", error.response?.data || error.message);
  }
}

module.exports = { loadUsers, saveUsers };
