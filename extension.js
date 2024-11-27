import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class CommandStoreExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._dataStore = [];
        this._indicator = null;
        this._editMode = false;
    }

    enable() {
        
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
        let inputField = new St.Entry({
            hint_text: "Enter command...",
            style_class: "command-input",
            can_focus: true,
            x_expand: true
        });
        let addButton = new St.Button({
            label: "+",
            style_class: "add-button"
        });
        let updateButton = new St.Button({
            label: "✓",
            style_class: "update-button",
            visible: false
        });
        inputBox.add_child(inputField);
        inputBox.add_child(addButton);
        inputBox.add_child(updateButton);

        
        let scrollView = new St.ScrollView({
            style_class: 'command-list-scroll'
        });
        
        
        let commandList = new St.BoxLayout({
            vertical: true,
            style_class: 'command-list'
        });
        scrollView.set_child(commandList);

        
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

        
        addButton.connect("clicked", () => this._addCommand(inputField, commandList));
        
        
        updateButton.connect("clicked", () => this._updateCommand(inputField, updateButton, addButton));

        
        editModeButton.connect("clicked", () => {
            this._editMode = !this._editMode;
            editModeButton.label = this._editMode ? "Done" : "Edit";
            this._toggleEditMode(commandList);
        });
        
        // Search functionality
        searchField.clutter_text.connect('text-changed', () => {
            this._filterCommands(commandList, searchField.text);
        });

        
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        
        this._inputField = inputField;
        this._commandList = commandList;
        this._addButton = addButton;
        this._updateButton = updateButton;
    }

    _addCommand(inputField, commandList) {
        const newCommand = inputField.text.trim();
        
        if (newCommand) {
            
            let commandBox = this._createCommandItem(newCommand, commandList);
            
            commandList.add_child(commandBox);
            this._dataStore.push(newCommand);
            
            
            inputField.set_text("");
            
            console.log(`Command added: ${newCommand}`);
        }
    }

    _createCommandItem(command, commandList) {
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
            this._dataStore = this._dataStore.filter(cmd => cmd !== command);
        });
        
        editButton.connect('clicked', () => {
            this._prepareEditCommand(command, commandBox);
        });
        
        commandBox.add_child(commandLabel);
        commandBox.add_child(editButton);
        commandBox.add_child(deleteButton);
        
        return commandBox;
    }

    _prepareEditCommand(currentCommand, commandBox) {
        this._inputField.set_text(currentCommand);
        this._addButton.visible = false;
        this._updateButton.visible = true;
        
       
        this._currentEditingCommand = {
            originalCommand: currentCommand,
            commandBox: commandBox
        };
    }

    _updateCommand(inputField, updateButton, addButton) {
        const updatedCommand = inputField.text.trim();
        
        if (updatedCommand && this._currentEditingCommand) {
            
            const index = this._dataStore.indexOf(this._currentEditingCommand.originalCommand);
            if (index !== -1) {
                this._dataStore[index] = updatedCommand;
            }
            
            
            let labelWidget = this._currentEditingCommand.commandBox.get_child_at_index(0);
            labelWidget.set_text(updatedCommand);
            
           
            inputField.set_text("");
            updateButton.visible = false;
            addButton.visible = true;
            
            
            this._currentEditingCommand = null;
        }
    }

    _toggleEditMode(commandList) {
        let children = commandList.get_children();
        children.forEach(child => {
            let deleteButton = child.get_child_at_index(2);
            let editButton = child.get_child_at_index(1);
            deleteButton.visible = this._editMode;
            editButton.visible = this._editMode;
        });
    }

    _filterCommands(commandList, searchText) {
        let children = commandList.get_children();
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

function init(meta) {
    return new CommandStoreExtension(meta);
}