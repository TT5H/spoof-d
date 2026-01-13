# Fish completion script for spoofy
# Copy to ~/.config/fish/completions/spoofy.fish
# Or install globally:
#   sudo cp completions/spoofy.fish /usr/share/fish/completions/spoofy.fish

function __spoofy_get_interfaces
    if command -v spoofy >/dev/null 2>&1
        spoofy list --json 2>/dev/null | grep -o '"device":"[^"]*"' | cut -d'"' -f4
    end
end

complete -c spoofy -f

# Main commands
complete -c spoofy -n '__fish_use_subcommand' -a 'list' -d 'List available network interfaces'
complete -c spoofy -n '__fish_use_subcommand' -a 'ls' -d 'Alias for list'
complete -c spoofy -n '__fish_use_subcommand' -a 'set' -d 'Set device MAC address'
complete -c spoofy -n '__fish_use_subcommand' -a 'randomize' -d 'Set device MAC address randomly'
complete -c spoofy -n '__fish_use_subcommand' -a 'reset' -d 'Reset device MAC address to default'
complete -c spoofy -n '__fish_use_subcommand' -a 'normalize' -d 'Normalize a MAC address format'
complete -c spoofy -n '__fish_use_subcommand' -a 'info' -d 'Show detailed interface information'
complete -c spoofy -n '__fish_use_subcommand' -a 'validate' -d 'Validate MAC address format'
complete -c spoofy -n '__fish_use_subcommand' -a 'vendor' -d 'Look up vendor from MAC address'
complete -c spoofy -n '__fish_use_subcommand' -a 'batch' -d 'Change multiple interfaces from config file'
complete -c spoofy -n '__fish_use_subcommand' -a 'history' -d 'View MAC address change history'
complete -c spoofy -n '__fish_use_subcommand' -a 'duid' -d 'DHCPv6 DUID spoofing commands'
complete -c spoofy -n '__fish_use_subcommand' -a 'help' -d 'Show help message'
complete -c spoofy -n '__fish_use_subcommand' -a 'version' -d 'Show package version'

# Global options
complete -c spoofy -s V -l verbose -d 'Show verbose output'
complete -c spoofy -s j -l json -d 'Output results in JSON format'
complete -c spoofy -s v -l version -d 'Show version'
complete -c spoofy -s h -l help -d 'Show help'

# list command
complete -c spoofy -n '__fish_seen_subcommand_from list ls' -l wifi -d 'Show only wireless interfaces'

# randomize command
complete -c spoofy -n '__fish_seen_subcommand_from randomize' -l local -d 'Set locally administered flag'
complete -c spoofy -n '__fish_seen_subcommand_from randomize' -a '(__spoofy_get_interfaces)'

# set command
complete -c spoofy -n '__fish_seen_subcommand_from set; and __fish_is_nth_token 2' -f -a '(__spoofy_get_interfaces)'
complete -c spoofy -n '__fish_seen_subcommand_from set; and __fish_is_nth_token 3' -a '(__spoofy_get_interfaces)'

# reset, info commands
complete -c spoofy -n '__fish_seen_subcommand_from reset info' -a '(__spoofy_get_interfaces)'

# normalize, validate, vendor commands
complete -c spoofy -n '__fish_seen_subcommand_from normalize validate vendor' -f

# batch command
complete -c spoofy -n '__fish_seen_subcommand_from batch' -f

# DUID subcommands
complete -c spoofy -n '__fish_seen_subcommand_from duid' -a 'list' -d 'Show current DUID'
complete -c spoofy -n '__fish_seen_subcommand_from duid' -a 'show' -d 'Alias for list'
complete -c spoofy -n '__fish_seen_subcommand_from duid' -a 'randomize' -d 'Generate and set a random DUID'
complete -c spoofy -n '__fish_seen_subcommand_from duid' -a 'set' -d 'Set specific DUID'
complete -c spoofy -n '__fish_seen_subcommand_from duid' -a 'sync' -d 'Sync DUID to current MAC address'
complete -c spoofy -n '__fish_seen_subcommand_from duid' -a 'restore' -d 'Restore original DUID'
complete -c spoofy -n '__fish_seen_subcommand_from duid' -a 'reset' -d 'Reset DUID to system default'
complete -c spoofy -n '__fish_seen_subcommand_from duid' -a 'generate' -d 'Generate a DUID without setting it'
complete -c spoofy -n '__fish_seen_subcommand_from duid' -a 'original' -d 'Manage original DUID backup'
complete -c spoofy -n '__fish_seen_subcommand_from duid' -a 'help' -d 'Show DUID command help'

# DUID options
complete -c spoofy -n '__fish_seen_subcommand_from duid' -l type -d 'DUID type (LLT, EN, LL, UUID)'
complete -c spoofy -n '__fish_seen_subcommand_from duid' -s i -l interface -d 'Network interface name'

# DUID randomize, set, sync, original commands
complete -c spoofy -n '__fish_seen_subcommand_from duid; and __fish_seen_subcommand_from randomize set sync original' -a '(__spoofy_get_interfaces)'
