import {env} from '../config/env.js';
import {listConfiguredCrmUsers} from './crmAuthService.js';
import {readCleanCrmAssignmentInventory} from './chatwootInboxService.js';

function groupBy(rows,key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    const group = groups.get(value) || [];
    group.push(row); groups.set(value,group);
  }
  return groups;
}

// This is the configured CRM namespace, not an ERP account list or a name-based
// identity match. Every response is freshly authorized; there is no read cache.
export function getCrmUserInventory(user) {
  const assignmentRows = readCleanCrmAssignmentInventory(user);
  const users = listConfiguredCrmUsers();
  const byId = groupBy(users,'id'), byUsername = groupBy(users,'username');
  const activeAgents = groupBy(users.filter(row=>row.active),'chatwootAgentId');
  const accounts = users.map(row => {
    const conflicts = [];
    if (byId.get(row.id).length > 1) conflicts.push('duplicate-user-id');
    if (byUsername.get(row.username).length > 1) conflicts.push('duplicate-username');
    if (row.active && row.chatwootAgentId && activeAgents.get(row.chatwootAgentId).length > 1) conflicts.push('shared-agent');
    return {
      userId:row.id, username:row.username, displayName:row.displayName,
      role:row.role, active:row.active, permissions:[...row.permissions],
      chatwootAgentId:row.chatwootAgentId,
      mappingState:conflicts.length?'conflict':!row.chatwootAgentId?'unlinked':!row.active?'inactive':'linked',
      conflicts,
    };
  });
  const assignments = assignmentRows.map(row => {
    const accountIds = (activeAgents.get(row.assigneeAgentId)||[]).map(account=>account.id);
    const linked = accounts.filter(account=>account.active && account.chatwootAgentId===row.assigneeAgentId);
    return {...row,accountIds,state:accountIds.length===1 && linked.every(account=>!account.conflicts.length)?'linked':accountIds.length?'conflict':'unmapped'};
  });
  const configuredAccountCount = env.auth.users.length;
  return {
    observedAt:new Date().toISOString(),
    context:{database:'MELISA_ERP_CLEAN_TEST_20261022',environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',synthetic:true},
    coverage:{
      accountsScope:'configured-crm-users', accountsComplete:configuredAccountCount===accounts.length,
      configuredAccountCount, omittedInvalidAccountCount:configuredAccountCount-accounts.length,
      agentsScope:'active-configured-agent-links', assignmentsScope:'clean-synthetic-conversation-projection',
    },
    accounts,
    agents:[...activeAgents].map(([agentId,rows])=>({agentId,accountIds:rows.map(row=>row.id)})),
    assignments,
    summary:{accounts:accounts.length,active:accounts.filter(row=>row.active).length,inactive:accounts.filter(row=>!row.active).length,unlinked:accounts.filter(row=>!row.chatwootAgentId).length,conflicting:accounts.filter(row=>row.conflicts.length).length,conversations:assignments.length},
    readOnly:true,
  };
}
