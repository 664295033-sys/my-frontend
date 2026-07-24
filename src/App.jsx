import React from 'react'

// Web App URL ของ Google Apps Script

const GAS_URL = "https://script.google.com/macros/s/AKfycbxI-ro5rN_zFz3ZlvD6xtJEP5hF0v2-G5EYzOy1gGKsZOUKsWOmgNXDOmGwLl83Rio/exec";

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <iframe 
        src={GAS_URL} 
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="ระบบเรียกคิวเอกซเรย์ออนไลน์"
      />
    </div>
  )
}