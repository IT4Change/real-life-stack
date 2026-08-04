// --- Queries ---

export const ITEMS_QUERY = `
  query Items($filter: ItemFilterInput) {
    items(filter: $filter) {
      id type createdAt createdBy context schema schemaVersion
      data relations { predicate target meta }
      _source _included
    }
  }
`

export const ITEM_QUERY = `
  query Item($id: ID!) {
    item(id: $id) {
      id type createdAt createdBy context schema schemaVersion
      data relations { predicate target meta }
      _source _included
    }
  }
`

export const GROUPS_QUERY = `
  query Groups {
    groups {
      id name data
      members { id displayName avatarUrl }
    }
  }
`

export const MEMBERS_QUERY = `
  query Members($groupId: ID!) {
    members(groupId: $groupId) {
      id displayName avatarUrl
    }
  }
`

export const RELATED_ITEMS_QUERY = `
  query RelatedItems($itemId: ID!, $predicate: String) {
    relatedItems(itemId: $itemId, predicate: $predicate) {
      id type createdAt createdBy context data
      relations { predicate target meta }
    }
  }
`

export const CURRENT_USER_QUERY = `
  query CurrentUser {
    currentUser { id displayName avatarUrl }
  }
`

export const USER_QUERY = `
  query User($id: ID!) {
    user(id: $id) { id displayName avatarUrl }
  }
`

export const CURRENT_GROUP_QUERY = `
  query CurrentGroup {
    currentGroup { id name data }
  }
`

export const AUTH_STATE_QUERY = `
  query AuthState {
    authState { status user { id displayName avatarUrl } }
  }
`

export const AUTH_METHODS_QUERY = `
  query AuthMethods {
    authMethods { method label }
  }
`

export const SOURCES_QUERY = `
  query Sources { sources { id name } }
`

export const ACTIVE_SOURCE_QUERY = `
  query ActiveSource { activeSource { id name } }
`

// --- Mutations ---

export const CREATE_ITEM_MUTATION = `
  mutation CreateItem($input: ItemInput!) {
    createItem(input: $input) {
      id type createdAt createdBy context data
      relations { predicate target meta }
    }
  }
`

export const UPDATE_ITEM_MUTATION = `
  mutation UpdateItem($id: ID!, $input: ItemUpdateInput!) {
    updateItem(id: $id, input: $input) {
      id type createdAt createdBy context data
      relations { predicate target meta }
    }
  }
`

export const DELETE_ITEM_MUTATION = `
  mutation DeleteItem($id: ID!) {
    deleteItem(id: $id)
  }
`

export const CREATE_GROUP_MUTATION = `
  mutation CreateGroup($name: String!, $data: JSON) {
    createGroup(name: $name, data: $data) {
      id name data
    }
  }
`

export const UPDATE_GROUP_MUTATION = `
  mutation UpdateGroup($id: ID!, $input: GroupUpdateInput!) {
    updateGroup(id: $id, input: $input) {
      id name data
    }
  }
`

export const DELETE_GROUP_MUTATION = `
  mutation DeleteGroup($id: ID!) {
    deleteGroup(id: $id)
  }
`

export const INVITE_MEMBER_MUTATION = `
  mutation InviteMember($groupId: ID!, $userId: ID!) {
    inviteMember(groupId: $groupId, userId: $userId)
  }
`

export const REMOVE_MEMBER_MUTATION = `
  mutation RemoveMember($groupId: ID!, $userId: ID!) {
    removeMember(groupId: $groupId, userId: $userId)
  }
`

export const SET_CURRENT_GROUP_MUTATION = `
  mutation SetCurrentGroup($id: ID!) {
    setCurrentGroup(id: $id) { id name data }
  }
`

export const AUTHENTICATE_MUTATION = `
  mutation Authenticate($method: String!, $credentials: JSON) {
    authenticate(method: $method, credentials: $credentials) {
      id displayName avatarUrl
    }
  }
`

export const LOGOUT_MUTATION = `
  mutation Logout {
    logout
  }
`

// --- Subscriptions ---

export const ITEMS_CHANGED_SUBSCRIPTION = `
  subscription ItemsChanged($filter: ItemFilterInput) {
    itemsChanged(filter: $filter) {
      id type createdAt createdBy context data
      relations { predicate target meta }
    }
  }
`

export const ITEM_CHANGED_SUBSCRIPTION = `
  subscription ItemChanged($id: ID!) {
    itemChanged(id: $id) {
      id type createdAt createdBy context data
      relations { predicate target meta }
    }
  }
`

export const AUTH_STATE_CHANGED_SUBSCRIPTION = `
  subscription AuthStateChanged {
    authStateChanged { status user { id displayName avatarUrl } }
  }
`
