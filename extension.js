import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export default class CommandStoreExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._editMode = false;
        this._showPrivateCommands = false;

        this._commands = {}; 

        this._currentEditingCommand = null;
        this._inputField = null;
        this._addButton = null;
        this._updateButton = null;
        this._commandList = null;
        this._commandsFilePath = null;
        
        // Privacy states
        this._privacyStates = [
            { icon: '🔓', label: 'Public', value: 0 },
            { icon: '🔒', label: 'Private', value: 1 },
            { icon: '👁', label: 'Restricted', value: 2 }
        ];
    }

    enable() {
        this._commandsFilePath = GLib.build_filenamev([
            GLib.get_user_cache_dir(), 
            'command-store-extension',
            'commands.json'
        ]);
        
        GLib.mkdir_with_parents(GLib.path_get_dirname(this._commandsFilePath), 0o755);

        this._loadCommands();

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name);

        let icon = new St.Icon({
            icon_name: 'utilities-terminal-symbolic',
            style_class: 'system-status-icon'
        });
        this._indicator.add_child(icon);

        let mainBox = new St.BoxLayout({
            vertical: true,
            style_class: 'command-store-popup',
            width: 350
        });

        let headerBox = new St.BoxLayout({
            vertical: true,
            style_class: 'header-box'
        });
        let titleLabel = new St.Label({
            text: 'Command Store',
            style_class: 'title-label'
        });
        let descLabel = new St.Label({
            text: 'Manage and store your frequently used commands',
            style_class: 'desc-label'
        });
        headerBox.add_child(titleLabel);
        headerBox.add_child(descLabel);

        let inputBox = new St.BoxLayout({
            style_class: 'input-box'
        });
        this._inputField = new St.Entry({
            hint_text: "Enter command...",
            style_class: "command-input",
            can_focus: true,
            x_expand: true
        });
        this._addButton = new St.Button({
            label: "+",
            style_class: "add-button"
        });
        this._updateButton = new St.Button({
            label: "✓",
            style_class: "update-button",
            visible: false
        });
        inputBox.add_child(this._inputField);
        inputBox.add_child(this._addButton);
        inputBox.add_child(this._updateButton);

        let scrollView = new St.ScrollView({
            style_class: 'command-list-scroll'
        });

        this._commandList = new St.BoxLayout({
            vertical: true,
            style_class: 'command-list'
        });
        scrollView.set_child(this._commandList);

        let searchField = new St.Entry({
            hint_text: "Search commands...",
            style_class: "search-input"
        });

        let privacyControlBox = new St.BoxLayout({
            style_class: 'privacy-control-box'
        });

        let editModeButton = new St.Button({
            label: "Edit",
            style_class: "edit-mode-button"
        });

        let privacyToggleButton = new St.Button({
            label: "Show Private",
            style_class: "privacy-toggle-button"
        });

        privacyControlBox.add_child(editModeButton);
        privacyControlBox.add_child(privacyToggleButton);

        mainBox.add_child(headerBox);
        mainBox.add_child(searchField);
        mainBox.add_child(inputBox);
        mainBox.add_child(privacyControlBox);
        mainBox.add_child(scrollView);

        let popupMenuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });
        popupMenuItem.add_child(mainBox);
        this._indicator.menu.addMenuItem(popupMenuItem);

        this._addButton.connect("clicked", () => this._addCommand());
        this._updateButton.connect("clicked", () => this._updateCommand());
        
        editModeButton.connect("clicked", () => {
            this._editMode = !this._editMode;
            editModeButton.label = this._editMode ? "Done" : "Edit";
            this._toggleEditMode();
        });

        privacyToggleButton.connect("clicked", () => {
            this._showPrivateCommands = !this._showPrivateCommands;
            privacyToggleButton.label = this._showPrivateCommands ? "Hide Private" : "Show Private";
            this._filterCommandsByPrivacy();
        });

        searchField.clutter_text.connect('text-changed', () => {
            this._filterCommands(searchField.text);
        });

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._populateCommandList();
    }

    _saveCommands() {
        try {
            let jsonCommands = JSON.stringify(this._commands, null, 2);
            GLib.file_set_contents(this._commandsFilePath, jsonCommands, jsonCommands.length);
            console.log('Commands saved successfully');
        } catch (error) {
            console.error(`Error saving commands: ${error}`);
        }
    }

    _loadCommands() {
        try {
            if (!GLib.file_test(this._commandsFilePath, GLib.FileTest.EXISTS)) {
                console.log('No saved commands file found');
                return; 
            }

            let [success, contents] = GLib.file_get_contents(this._commandsFilePath);
            if (!success) {
                console.error('Failed to read commands file');
                return;
            }

            let jsonCommands = new TextDecoder().decode(contents);
            this._commands = JSON.parse(jsonCommands);
            console.log('Commands loaded successfully');
        } catch (error) {
            console.error(`Error loading commands: ${error}`);
        }
    }

    _populateCommandList() {
        this._commandList.remove_all_children();

        for (const commandId in this._commands) {
            let commandBox = this._createCommandItem(this._commands[commandId], commandId);
            this._commandList.add_child(commandBox);
        }
    }

    _createCommandItem(command, commandId) {
        let commandDetails = typeof command === 'object' ? command : { 
            command: command, 
            privacy: 0, 
            createdAt: Date.now(),
            lastUsed: null,
            usageCount: 0
        };

        let commandBox = new St.BoxLayout({
            style_class: 'command-item'
        });

        let commandLabel = new St.Label({
            text: commandDetails.command,
            x_expand: true,
            style_class: 'command-label'
        });

        let deleteButton = new St.Button({
            label: '✕',
            style_class: 'delete-button',
            visible: this._editMode
        });

        let editButton = new St.Button({
            label: '✎',
            style_class: 'edit-button',
            visible: this._editMode
        });

        let copyButton = new St.Button({
            label: '📋',
            style_class: 'copy-button',
            visible: true
        });

        let privacyState = commandDetails.privacy || 0;
        let privateToggle = new St.Button({
            label: this._privacyStates[privacyState].icon,
            style_class: 'private-toggle-button',
            visible: this._editMode
        });

        deleteButton.connect('clicked', () => {
            commandBox.destroy();
            delete this._commands[commandId]; 
            this._saveCommands();
        });

        editButton.connect('clicked', () => {
            this._prepareEditCommand(commandDetails, commandBox, commandId);
        });

        copyButton.connect('clicked', () => {
            let clipboard = St.Clipboard.get_default();
            clipboard.set_text(St.ClipboardType.CLIPBOARD, commandDetails.command);
            
            
            this._commands[commandId].lastUsed = Date.now();
            this._commands[commandId].usageCount = (this._commands[commandId].usageCount || 0) + 1;
            this._saveCommands();
        });

        privateToggle.connect('clicked', () => {
            privacyState = (privacyState + 1) % this._privacyStates.length;
            this._commands[commandId].privacy = privacyState;
            privateToggle.label = this._privacyStates[privacyState].icon;
            this._saveCommands();
        });

        commandBox.add_child(commandLabel);
        commandBox.add_child(editButton);
        commandBox.add_child(deleteButton);
        commandBox.add_child(copyButton);
        commandBox.add_child(privateToggle);

        
        commandBox.commandId = commandId;

        return commandBox;
    }

    _prepareEditCommand(command, commandBox, commandId) {
        this._inputField.set_text(command.command);
        this._addButton.visible = false;
        this._updateButton.visible = true;

        this._currentEditingCommand = { 
            command, 
            commandBox, 
            commandId 
        };
    }

    _addCommand() {
        const newCommand = this._inputField.text.trim();
        if (newCommand) {
            const commandId = `command_${Date.now()}`; 
            this._commands[commandId] = {
                command: newCommand,
                privacy: 0,
                createdAt: Date.now(),
                lastUsed: null,
                usageCount: 0
            };

            let commandBox = this._createCommandItem(this._commands[commandId], commandId);
            this._commandList.add_child(commandBox);

            this._inputField.set_text("");

            this._saveCommands();
        }
    }

    _updateCommand() {
        const updatedCommand = this._inputField.text.trim();
        if (updatedCommand && this._currentEditingCommand) {
            const { command, commandBox, commandId } = this._currentEditingCommand;

            
            const currentPrivacy = this._commands[commandId].privacy || 0;

            this._commands[commandId] = {
                command: updatedCommand,
                privacy: currentPrivacy,
                createdAt: command.createdAt,
                lastUsed: command.lastUsed,
                usageCount: command.usageCount
            };

            let commandLabel = commandBox.get_child_at_index(0);
            commandLabel.set_text(updatedCommand);

            this._inputField.set_text("");
            this._updateButton.visible = false;
            this._addButton.visible = true;

            this._currentEditingCommand = null;

            this._saveCommands();
        }
    }

    _toggleEditMode() {
        let children = this._commandList.get_children();
        children.forEach(child => {
            let deleteButton = child.get_child_at_index(2);
            let editButton = child.get_child_at_index(1);
            let copyButton = child.get_child_at_index(3);
            let privateToggle = child.get_child_at_index(4);
            
            deleteButton.visible = this._editMode;
            editButton.visible = this._editMode;
            privateToggle.visible = this._editMode;
        });
    }

    _filterCommandsByPrivacy() {
        let children = this._commandList.get_children();
        children.forEach(child => {
            let commandId = child.commandId;
            let command = this._commands[commandId];
            
            let isPrivate = command.privacy > 0;
            let shouldShow = this._showPrivateCommands || !isPrivate || this._editMode;
            
            child.visible = shouldShow;
        });
    }

    _filterCommands(searchText) {
        let children = this._commandList.get_children();
        children.forEach(child => {
            let label = child.get_child_at_index(0);
            let commandText = typeof label.text === 'object' ? label.text.command : label.text;
            
            let searchMatch = searchText.length === 0 || 
                commandText.toLowerCase().includes(searchText.toLowerCase());
            
            
            let commandId = child.commandId;
            let command = this._commands[commandId];
            let privacyCheck = this._showPrivateCommands || command.privacy === 0 || this._editMode;
            
            child.visible = searchMatch && privacyCheck;
        });
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._inputField = null;
        this._addButton = null;
        this._updateButton = null;
        this._commandList = null;
        this._currentEditingCommand = null;
        this._commandsFilePath = null;
    }
}