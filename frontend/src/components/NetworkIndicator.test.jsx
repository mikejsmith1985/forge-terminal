import { render, screen } from '@testing-library/react'
import { NetworkIndicator } from './NetworkIndicator'

describe('NetworkIndicator', () => {
  it('shows green status when latency < 100ms', () => {
    render(<NetworkIndicator latency={50} connected={true} reconnecting={false} />)
    const indicator = document.querySelector('.network-indicator')
    expect(indicator).toHaveClass('good')
  })

  it('shows yellow status when latency 100-500ms', () => {
    render(<NetworkIndicator latency={250} connected={true} reconnecting={false} />)
    const indicator = document.querySelector('.network-indicator')
    expect(indicator).toHaveClass('degraded')
  })

  it('shows red status when latency > 500ms', () => {
    render(<NetworkIndicator latency={750} connected={true} reconnecting={false} />)
    const indicator = document.querySelector('.network-indicator')
    expect(indicator).toHaveClass('poor')
  })

  it('shows red when disconnected', () => {
    render(<NetworkIndicator latency={null} connected={false} reconnecting={false} />)
    const indicator = document.querySelector('.network-indicator')
    expect(indicator).toHaveClass('disconnected')
  })

  it('shows reconnecting state with spinner', () => {
    render(<NetworkIndicator latency={null} connected={false} reconnecting={true} />)
    const spinner = document.querySelector('.network-reconnecting')
    expect(spinner).toBeInTheDocument()
  })

  it('displays latency value', () => {
    render(<NetworkIndicator latency={42} connected={true} reconnecting={false} />)
    expect(screen.getByText(/42\s*ms/i)).toBeInTheDocument()
  })

  it('shows no latency text when disconnected', () => {
    render(<NetworkIndicator latency={null} connected={false} reconnecting={false} />)
    expect(screen.queryByText(/ms/i)).not.toBeInTheDocument()
  })

  it('shows offline text when disconnected', () => {
    render(<NetworkIndicator latency={null} connected={false} reconnecting={false} />)
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
  })

  it('shows reconnecting text', () => {
    render(<NetworkIndicator latency={null} connected={false} reconnecting={true} />)
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
  })
})
