// Supabase password authentication requires an email-shaped identifier.
// .invalid is reserved/non-deliverable; it is never a user mailbox.
// Keep mapping stable: changing it would prevent existing users from signing in.
export function usernameCredentials(value:unknown):{username:string;email:string}{
 const username=typeof value==='string'?value.trim().toLowerCase():'';
 if(!/^[a-z0-9_]{3,32}$/.test(username))throw new Error('Логин: от 3 до 32 символов — латинские буквы, цифры и _');
 return {username,email:`${username}@users.tikho.invalid`};
}
