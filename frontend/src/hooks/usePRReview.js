import { useState, useCallback } from 'react'
import { API_CONFIG } from '../config'

const AUTH_TOKEN_KEY = 'forge-auth-token'

/**
 * Authenticated fetch for the review API.
 * Mirrors the workflowFetch pattern in useWorkflowSetup.js.
 */
const reviewFetch = async (url, options = {}) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_CONFIG.base}${url}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Hook for the PR Quality Agent review panel.
 *
 * Manages the full lifecycle of a code review request: submitting a diff
 * to the Quality Agent, tracking loading state, and holding the resulting
 * ReviewReport (findings, score, summary).
 *
 * @returns {{
 *   reviewReport: object|null,
 *   isReviewing: boolean,
 *   reviewError: string|null,
 *   runReview: Function,
 *   clearReport: Function,
 * }}
 */
export function usePRReview() {
  const [reviewReport, setReviewReport] = useState(null)
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewError, setReviewError] = useState(null)

  /**
   * Submit a diff to the Quality Agent and store the resulting report.
   *
   * @param {object} reviewParams
   * @param {string} reviewParams.projectPath - Absolute project directory path
   * @param {string} reviewParams.diff - Unified diff content from git
   * @param {string[]} reviewParams.changedFiles - List of file paths changed
   * @param {string} [reviewParams.strictness] - "lenient" | "standard" | "strict"
   * @param {string[]} [reviewParams.focusAreas] - Subset of areas to review
   */
  const runReview = useCallback(async ({
    projectPath,
    diff,
    changedFiles,
    strictness = 'standard',
    focusAreas = [],
  }) => {
    if (!diff) {
      setReviewError('No diff provided. Make sure there are changes to review.')
      return null
    }

    setIsReviewing(true)
    setReviewError(null)
    setReviewReport(null)

    try {
      const report = await reviewFetch('/api/review/analyze', {
        method: 'POST',
        body: JSON.stringify({
          projectPath,
          diff,
          changedFiles,
          strictness,
          focusAreas,
        }),
      })
      setReviewReport(report)
      return report
    } catch (fetchError) {
      const errorMessage = `Review failed: ${fetchError.message}`
      setReviewError(errorMessage)
      return null
    } finally {
      setIsReviewing(false)
    }
  }, [])

  /**
   * Clear the current report and error, resetting the panel to idle state.
   */
  const clearReport = useCallback(() => {
    setReviewReport(null)
    setReviewError(null)
  }, [])

  return {
    reviewReport,
    isReviewing,
    reviewError,
    runReview,
    clearReport,
  }
}
