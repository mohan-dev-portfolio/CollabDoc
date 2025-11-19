// Mock WebSocket implementation for demonstration
class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = WebSocket.CONNECTING;
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;
        
        // Simulate connection after a short delay
        setTimeout(() => {
            this.readyState = WebSocket.OPEN;
            if (this.onopen) this.onopen({ type: 'open' });
        }, 500);
        
        // Store reference to the other users' sockets for simulation
        if (!window.mockSockets) window.mockSockets = [];
        window.mockSockets.push(this);
        
        // Simulate initial users
        setTimeout(() => {
            this.simulateOtherUsers();
        }, 1000);
    }
    
    simulateOtherUsers() {
        const mockUsers = [
            { id: 'user2', name: 'Alex Johnson', color: '#34a853', avatar: 'A' },
            { id: 'user3', name: 'Sam Davis', color: '#fbbc05', avatar: 'S' }
        ];
        
        // Send user joined events for mock users
        mockUsers.forEach(user => {
            this.send(JSON.stringify({
                type: 'user-joined',
                user: user
            }));
        });
        
        // Simulate periodic cursor movements
        setInterval(() => {
            mockUsers.forEach(user => {
                if (Math.random() > 0.7) { // 30% chance to move cursor
                    this.send(JSON.stringify({
                        type: 'cursor-update',
                        userId: user.id,
                        position: {
                            x: Math.random() * 300 + 50,
                            y: Math.random() * 200 + 50
                        }
                    }));
                }
            });
        }, 2000);
    }
    
    send(data) {
        // Broadcast to other mock sockets
        window.mockSockets.forEach(socket => {
            if (socket !== this && socket.readyState === WebSocket.OPEN) {
                setTimeout(() => {
                    if (socket.onmessage) {
                        socket.onmessage({ data: data });
                    }
                }, Math.random() * 100); // Random delay to simulate network
            }
        });
    }
    
    close() {
        this.readyState = WebSocket.CLOSED;
        if (this.onclose) this.onclose();
        
        // Remove from mock sockets
        const index = window.mockSockets.indexOf(this);
        if (index > -1) {
            window.mockSockets.splice(index, 1);
        }
    }
}

// Main application
class CollaborationApp {
    constructor() {
        this.socket = null;
        this.currentUser = {
            id: this.generateId(),
            name: 'User',
            color: this.getRandomColor(),
            avatar: 'U'
        };
        this.users = new Map();
        this.cursors = new Map();
        this.documentId = 'demo-doc-123';
        this.isConnected = false;
        this.lastContent = '';
        
        this.initializeApp();
    }
    
    initializeApp() {
        // Show username modal
        this.showUsernameModal();
        
        // Set up event listeners
        document.getElementById('join-btn').addEventListener('click', () => {
            this.joinDocument();
        });
        
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinDocument();
            }
        });
        
        // Mobile menu button
        document.getElementById('mobile-menu-btn').addEventListener('click', () => {
            this.toggleSidebar();
        });
        
        document.getElementById('close-sidebar').addEventListener('click', () => {
            this.hideSidebar();
        });
        
        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            const menuBtn = document.getElementById('mobile-menu-btn');
            
            if (window.innerWidth <= 768 && 
                sidebar.classList.contains('active') &&
                !sidebar.contains(e.target) && 
                !menuBtn.contains(e.target)) {
                this.hideSidebar();
            }
        });
        
        // Set up editor event listeners
        this.setupEditor();
        
        // Set up toolbar buttons
        this.setupToolbar();
        
        // Handle window resize
        window.addEventListener('resize', this.handleResize.bind(this));
    }
    
    showUsernameModal() {
        document.getElementById('username-modal').classList.remove('hidden');
        document.getElementById('username-input').focus();
    }
    
    hideUsernameModal() {
        document.getElementById('username-modal').classList.add('hidden');
    }
    
    joinDocument() {
        const usernameInput = document.getElementById('username-input');
        const username = usernameInput.value.trim();
        
        if (!username) {
            alert('Please enter your name');
            return;
        }
        
        this.currentUser.name = username;
        this.currentUser.avatar = username.charAt(0).toUpperCase();
        
        // Update UI with user info
        document.getElementById('current-user-name').textContent = username;
        document.getElementById('current-user-avatar').textContent = this.currentUser.avatar;
        document.getElementById('current-user-avatar').style.backgroundColor = this.currentUser.color;
        
        this.hideUsernameModal();
        this.connectToServer();
    }
    
    connectToServer() {
        // In a real app, this would connect to your WebSocket server
        this.socket = new MockWebSocket('ws://localhost:8080');
        
        this.socket.onopen = () => {
            this.isConnected = true;
            this.updateConnectionStatus('Connected', 'connected');
            
            // Send join message
            this.sendMessage({
                type: 'join',
                user: this.currentUser,
                documentId: this.documentId
            });
            
            // Request current document state
            this.sendMessage({
                type: 'get-document',
                documentId: this.documentId
            });
        };
        
        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };
        
        this.socket.onclose = () => {
            this.isConnected = false;
            this.updateConnectionStatus('Disconnected', 'disconnected');
        };
        
        this.socket.onerror = () => {
            this.updateConnectionStatus('Connection Error', 'disconnected');
        };
    }
    
    handleMessage(message) {
        switch (message.type) {
            case 'user-joined':
                this.addUser(message.user);
                break;
            case 'user-left':
                this.removeUser(message.userId);
                break;
            case 'users-list':
                if (message.users && Array.isArray(message.users)) {
                    message.users.forEach(user => this.addUser(user));
                }
                break;
            case 'cursor-update':
                this.updateCursor(message.userId, message.position);
                break;
            case 'content-update':
                if (message.operations && Array.isArray(message.operations)) {
                    this.applyRemoteUpdate(message.operations);
                }
                break;
            case 'document-state':
                this.loadDocument(message.content);
                break;
        }
    }
    
    sendMessage(message) {
        if (this.socket && this.isConnected) {
            try {
                this.socket.send(JSON.stringify(message));
            } catch (error) {
                console.error('Error sending message:', error);
            }
        }
    }
    
    addUser(user) {
        if (!user || !user.id || user.id === this.currentUser.id) return;
        
        this.users.set(user.id, user);
        this.updateUserList();
        
        // Create cursor for this user
        this.createCursor(user);
    }
    
    removeUser(userId) {
        if (!userId) return;
        
        this.users.delete(userId);
        
        // Remove cursor
        const cursor = this.cursors.get(userId);
        if (cursor) {
            cursor.element.remove();
            this.cursors.delete(userId);
        }
        
        this.updateUserList();
    }
    
    updateUserList() {
        const userList = document.getElementById('user-list');
        if (!userList) return;
        
        userList.innerHTML = '';
        
        // Add current user first
        const currentUserItem = this.createUserListItem(this.currentUser, true);
        userList.appendChild(currentUserItem);
        
        // Add other users
        this.users.forEach(user => {
            const userItem = this.createUserListItem(user, false);
            userList.appendChild(userItem);
        });
    }
    
    createUserListItem(user, isCurrentUser) {
        const item = document.createElement('div');
        item.className = `user-item ${isCurrentUser ? 'active' : ''}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = user.avatar || (user.name ? user.name.charAt(0).toUpperCase() : '?');
        avatar.style.backgroundColor = user.color || this.getRandomColor();
        
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = `${user.name || 'Unknown'}${isCurrentUser ? ' (You)' : ''}`;
        
        item.appendChild(avatar);
        item.appendChild(name);
        
        return item;
    }
    
    createCursor(user) {
        const editor = document.getElementById('editor');
        if (!editor) return;
        
        const cursorElement = document.createElement('div');
        cursorElement.className = 'cursor';
        cursorElement.style.backgroundColor = user.color;
        
        const labelElement = document.createElement('div');
        labelElement.className = 'cursor-label';
        labelElement.textContent = user.name || 'Unknown';
        labelElement.style.backgroundColor = user.color;
        
        cursorElement.appendChild(labelElement);
        editor.appendChild(cursorElement);
        
        this.cursors.set(user.id, {
            element: cursorElement,
            user: user
        });
    }
    
    updateCursor(userId, position) {
        if (!position) return;
        
        const cursor = this.cursors.get(userId);
        if (cursor && cursor.element) {
            cursor.element.style.left = `${position.x}px`;
            cursor.element.style.top = `${position.y}px`;
        }
    }
    
    setupEditor() {
        const editor = document.getElementById('editor');
        if (!editor) return;
        
        // Track changes to send to other users
        editor.addEventListener('input', (e) => {
            this.sendContentUpdate();
            this.updateCharacterCount();
        });
        
        // Track selection/cursor position
        editor.addEventListener('click', (e) => {
            this.sendCursorPosition();
        });
        
        editor.addEventListener('keyup', (e) => {
            this.sendCursorPosition();
        });
        
        // Prevent paste of formatted text that could break the app
        editor.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            document.execCommand('insertText', false, text);
        });
        
        // Initial character count
        this.updateCharacterCount();
    }
    
    sendContentUpdate() {
        const editor = document.getElementById('editor');
        if (!editor) return;
        
        const content = editor.innerHTML;
        
        // Only send if content actually changed
        if (content === this.lastContent) return;
        
        this.lastContent = content;
        
        // In a real app, we would send operational transforms or CRDT updates
        // For this demo, we'll just send the full content
        this.sendMessage({
            type: 'content-update',
            documentId: this.documentId,
            operations: [{
                type: 'replace',
                content: content
            }]
        });
    }
    
    sendCursorPosition() {
        // In a real app, we would calculate the actual cursor position
        // For this demo, we'll use a random position
        const editor = document.getElementById('editor');
        if (!editor) return;
        
        const rect = editor.getBoundingClientRect();
        
        const x = Math.random() * (rect.width - 50) + 25;
        const y = Math.random() * (rect.height - 50) + 25;
        
        this.sendMessage({
            type: 'cursor-update',
            userId: this.currentUser.id,
            position: { x, y }
        });
    }
    
    applyRemoteUpdate(operations) {
        if (!operations || !Array.isArray(operations)) return;
        
        const editor = document.getElementById('editor');
        if (!editor) return;
        
        // Save current cursor position
        const selection = window.getSelection();
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        
        // Apply update
        operations.forEach(op => {
            if (op.type === 'replace' && op.content !== undefined) {
                editor.innerHTML = op.content;
                this.lastContent = op.content;
            }
        });
        
        // Restore cursor position if possible
        if (range) {
            try {
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (e) {
                // Range might not be valid after content change, ignore
            }
        }
        
        this.updateCharacterCount();
    }
    
    loadDocument(content) {
        if (content && content !== this.lastContent) {
            const editor = document.getElementById('editor');
            if (editor) {
                editor.innerHTML = content;
                this.lastContent = content;
                this.updateCharacterCount();
            }
        }
    }
    
    updateCharacterCount() {
        const editor = document.getElementById('editor');
        if (!editor) return;
        
        const text = editor.textContent || '';
        const charCount = document.getElementById('char-count');
        if (charCount) {
            charCount.textContent = `Characters: ${text.length}`;
        }
    }
    
    updateConnectionStatus(status, statusClass) {
        const statusText = document.getElementById('status-text');
        const indicator = document.getElementById('status-indicator');
        
        if (statusText) statusText.textContent = status;
        if (indicator) {
            indicator.className = 'status-indicator';
            indicator.classList.add(statusClass);
        }
    }
    
    setupToolbar() {
        // Text formatting buttons
        document.getElementById('bold-btn')?.addEventListener('click', () => {
            document.execCommand('bold', false, null);
            this.sendContentUpdate();
        });
        
        document.getElementById('italic-btn')?.addEventListener('click', () => {
            document.execCommand('italic', false, null);
            this.sendContentUpdate();
        });
        
        document.getElementById('underline-btn')?.addEventListener('click', () => {
            document.execCommand('underline', false, null);
            this.sendContentUpdate();
        });
        
        document.getElementById('bullet-list-btn')?.addEventListener('click', () => {
            document.execCommand('insertUnorderedList', false, null);
            this.sendContentUpdate();
        });
        
        // Clear document button
        document.getElementById('clear-btn')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the document? This will clear for all users.')) {
                const editor = document.getElementById('editor');
                if (editor) {
                    editor.innerHTML = '';
                    this.sendContentUpdate();
                }
            }
        });
    }
    
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('active');
        }
    }
    
    hideSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.remove('active');
        }
    }
    
    handleResize() {
        // Auto-hide sidebar on mobile when switching to desktop
        if (window.innerWidth > 768) {
            this.hideSidebar();
        }
    }
    
    generateId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    
    getRandomColor() {
        const colors = ['#4285f4', '#34a853', '#fbbc05', '#ea4335', '#9c27b0', '#009688', '#ff9800'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CollaborationApp();
});

// Handle page visibility change to update connection status
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Page is visible again, could trigger a reconnection here
    }
});