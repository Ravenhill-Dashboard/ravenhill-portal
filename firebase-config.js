/**
 * Firebase Configuration & Initialization
 * 
 * IMPORTANT: Replace the placeholder values below with your actual Firebase project config.
 * You can find this in the Firebase Console: Project Settings > General > Your apps.
 */
const firebaseConfig = {
    apiKey: "AIzaSyCST-IlVYB0CXSrLhNMJJVZFauiZTEwy6g",
    authDomain: "ravenhill-dashboard.firebaseapp.com",
    projectId: "ravenhill-dashboard",
    storageBucket: "ravenhill-dashboard.firebasestorage.app",
    messagingSenderId: "449231586340",
    appId: "1:449231586340:web:6bd6611a71a6c1341544b1",
    measurementId: "G-YQC964VFD1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Services
const auth = firebase.auth();
const db = firebase.firestore();

// Export for use in other scripts
window.auth = auth;
window.db = db;
