// Google Cast: the App ID of the Birdsongs custom receiver, registered at
// https://cast.google.com/publish with the receiver URL
//   https://birdsongs.superfun.games/receiver.html
// App IDs aren't secret. Set it to an empty string to hide the Cast button. A Netlify
// environment variable VITE_CAST_APP_ID overrides this.
export const CAST_APP_ID = import.meta.env.VITE_CAST_APP_ID || 'C44BED16';

// custom message channel between the site and the TV
export const CAST_NAMESPACE = 'urn:x-cast:games.superfun.birdsongs';
