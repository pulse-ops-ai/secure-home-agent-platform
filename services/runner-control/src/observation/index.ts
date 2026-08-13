/**
 * Workspace and artifact observation (design D3).
 *
 * This module looks, and hands what it saw to the core. It does not
 * decide what the observation means — `deriveAuthoritativeChangeSet`
 * does, and it accepts the host observation only, so a claim cannot reach
 * derivation through this path even by accident.
 *
 * "We could not look" travels as `ok: false` and classifies as an
 * operational failure. It is deliberately NOT an empty change set:
 * "nothing changed" and "we could not see whether anything changed" are
 * different facts, and collapsing them would let an unreadable workspace
 * read as a clean one.
 */
import {
  deriveAuthoritativeChangeSet,
  type ArtifactObservation,
  type AuthoritativeChangeSet,
  type ObservedDecision,
} from '@secure-home/runner-core'
import type { ArtifactObserverPort, WorkspaceObserverPort } from '../ports/index.js'

export const observeWorkspace = async (
  port: WorkspaceObserverPort,
  request: { readonly run_id: string; readonly root: string },
): Promise<ObservedDecision<AuthoritativeChangeSet>> =>
  deriveAuthoritativeChangeSet(await port.observe(request))

export const observeArtifacts = async (
  port: ArtifactObserverPort,
  request: { readonly run_id: string; readonly paths: readonly string[] },
): Promise<ArtifactObservation> => port.observe(request)
