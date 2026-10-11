import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './brand/theme.css'
import { Site } from './site/Site'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Site />
  </StrictMode>,
)
