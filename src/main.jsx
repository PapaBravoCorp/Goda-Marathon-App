import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { captureLinkCode } from './utils/offer'

// A discount code carried by the link (?code=CLUB20), remembered before the
// first render so it reaches the registration form from whichever page the
// visitor landed on.
captureLinkCode()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
