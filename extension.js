import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import GLib from 'gi://GLib';

export default class CommandStoreExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._editMode = false;

        
        this._commands = {}; 

        this._currentEditingCommand = null;
        this._inputField = null;
        this._addButton = null;
        this._updateButton = null;
        this._commandList = null;

        
        this._commandsFilePath = GLib.build_filenamev([
            GLib.get_home_dir(), 
            '.env'
        ]);
    }

    enable() {
        
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

        let editModeButton = new St.Button({
            label: "Edit",
            style_class: "edit-mode-button"
        });

        mainBox.add_child(headerBox);
        mainBox.add_child(searchField);
        mainBox.add_child(inputBox);
        mainBox.add_child(editModeButton);
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
        searchField.clutter_text.connect('text-changed', () => {
            this._filterCommands(searchField.text);
        });

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._populateCommandList();
    }

    
    _saveCommands() {
        try {
            let envContent = '';
            
            for (const commandId in this._commands) {
                
                const escapedCommand = this._commands[commandId]
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/\n/g, '\\n');
                
                envContent += `COMMAND_${commandId}="${escapedCommand}"\n`;
            }

            
            GLib.file_set_contents(this._commandsFilePath, envContent, envContent.length);
        } catch (error) {
            log(`Error saving commands: ${error}`);
        }
    }

    
    _loadCommands() {
        try {
            
            if (!GLib.file_test(this._commandsFilePath, GLib.FileTest.EXISTS)) {
                return; 
            }

            
            let [success, contents] = GLib.file_get_contents(this._commandsFilePath);
            if (!success) {
                log('Failed to read .env file');
                return;
            }

            
            const envContent = new TextDecoder().decode(contents);
            const lines = envContent.split('\n');
            
            lines.forEach(line => {
                const match = line.match(/^COMMAND_(\w+)="(.+)"$/);
                if (match) {
                    const commandId = match[1];
                    const command = match[2]
                        .replace(/\\n/g, '\n')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');
                    this._commands[commandId] = command;
                }
            });
        } catch (error) {
            log(`Error loading commands: ${error}`);
        }
    }


    _populateCommandList() {
        
        this._commandList.remove_all_children();

        for (const commandId in this._commands) {
            let commandBox = this._createCommandItem(this._commands[commandId]);
            this._commandList.add_child(commandBox);
        }
    }

    
    _createCommandItem(command) {
        let commandBox = new St.BoxLayout({
            style_class: 'command-item'
        });

        let commandLabel = new St.Label({
            text: command,
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

        deleteButton.connect('clicked', () => {
            commandBox.destroy();
            for (const commandId in this._commands) {
                if (this._commands[commandId] === command) {
                    delete this._commands[commandId]; // Remove from the in-memory object
                    break;
                }
            }

            
            this._saveCommands();
        });

        editButton.connect('clicked', () => {
            this._prepareEditCommand(command, commandBox);
        });

        commandBox.add_child(commandLabel);
        commandBox.add_child(editButton);
        commandBox.add_child(deleteButton);

        return commandBox;
    }

    _prepareEditCommand(command, commandBox) {
        this._inputField.set_text(command);
        this._addButton.visible = false;
        this._updateButton.visible = true;

        
        this._currentEditingCommand = { command, commandBox };
    }

    _addCommand() {
        const newCommand = this._inputField.text.trim();
        if (newCommand) {
            const commandId = `command_${Date.now()}`; // Unique ID for each command
            this._commands[commandId] = newCommand; // Save command with a unique ID

            let commandBox = this._createCommandItem(newCommand);
            this._commandList.add_child(commandBox);

            this._inputField.set_text("");

            
            this._saveCommands();
        }
    }

    _updateCommand() {
        const updatedCommand = this._inputField.text.trim();
        if (updatedCommand && this._currentEditingCommand) {
            const { command, commandBox } = this._currentEditingCommand;

            
            for (const commandId in this._commands) {
                if (this._commands[commandId] === command) {
                    this._commands[commandId] = updatedCommand;
                    break;
                }
            }

            
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
            deleteButton.visible = this._editMode;
            editButton.visible = this._editMode;
        });
    }

    _filterCommands(searchText) {
        let children = this._commandList.get_children();
        children.forEach(child => {
            let label = child.get_child_at_index(0);
            let visible = searchText.length === 0 || 
                label.text.toLowerCase().includes(searchText.toLowerCase());
            child.visible = visible;
        });
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}