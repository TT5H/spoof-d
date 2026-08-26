# Fish completion script for spoofd
# Copy to ~/.config/fish/completions/spoofd.fish
# Or install globally:
#   sudo cp completions/spoofd.fish /usr/share/fish/completions/spoofd.fish

function __spoofd_get_interfaces
    if command -v spoofd >/dev/null 2>&1
        spoofd list --json 2>/dev/null | grep -o '"device":"[^"]*"' | cut -d'"' -f4
    end
end

complete -c spoofd -f

# Main commands
complete -c spoofd -n '__fish_use_subcommand' -a 'list' -d 'List available network interfaces'
complete -c spoofd -n '__fish_use_subcommand' -a 'ls' -d 'Alias for list'
complete -c spoofd -n '__fish_use_subcommand' -a 'set' -d 'Set device MAC address'
complete -c spoofd -n '__fish_use_subcommand' -a 'randomize' -d 'Set device MAC address randomly'
complete -c spoofd -n '__fish_use_subcommand' -a 'reset' -d 'Reset device MAC address to default'
complete -c spoofd -n '__fish_use_subcommand' -a 'normalize' -d 'Normalize a MAC address format'
complete -c spoofd -n '__fish_use_subcommand' -a 'info' -d 'Show detailed interface information'
complete -c spoofd -n '__fish_use_subcommand' -a 'validate' -d 'Validate MAC address format'
complete -c spoofd -n '__fish_use_subcommand' -a 'vendor' -d 'Look up vendor from MAC address'
complete -c spoofd -n '__fish_use_subcommand' -a 'batch' -d 'Change multiple interfaces from config file'
complete -c spoofd -n '__fish_use_subcommand' -a 'history' -d 'View MAC address change history'
complete -c spoofd -n '__fish_use_subcommand' -a 'duid' -d 'DHCPv6 DUID spoofing commands'
complete -c spoofd -n '__fish_use_subcommand' -a 'help' -d 'Show help message'
complete -c spoofd -n '__fish_use_subcommand' -a 'version' -d 'Show package version'

# Global options
complete -c spoofd -s V -l verbose -d 'Show verbose output'
complete -c spoofd -s j -l json -d 'Output results in JSON format'
complete -c spoofd -l update -n '__fish_seen_subcommand_from vendor' -d 'Refresh the cached IEEE OUI registry'
complete -c spoofd -s v -l version -d 'Show version'
complete -c spoofd -s h -l help -d 'Show help'

# list command
complete -c spoofd -n '__fish_seen_subcommand_from list ls' -l wifi -d 'Show only wireless interfaces'

# randomize command
complete -c spoofd -n '__fish_seen_subcommand_from randomize' -l local -d 'Set locally administered flag'
complete -c spoofd -n '__fish_seen_subcommand_from randomize' -a '(__spoofd_get_interfaces)'

# set command
complete -c spoofd -n '__fish_seen_subcommand_from set; and __fish_is_nth_token 2' -f -a '(__spoofd_get_interfaces)'
complete -c spoofd -n '__fish_seen_subcommand_from set; and __fish_is_nth_token 3' -a '(__spoofd_get_interfaces)'

# reset, info commands
complete -c spoofd -n '__fish_seen_subcommand_from reset info' -a '(__spoofd_get_interfaces)'

# normalize, validate, vendor commands
complete -c spoofd -n '__fish_seen_subcommand_from normalize validate vendor' -f

# batch command
complete -c spoofd -n '__fish_seen_subcommand_from batch' -f

# DUID subcommands
complete -c spoofd -n '__fish_seen_subcommand_from duid' -a 'list' -d 'Show current DUID'
complete -c spoofd -n '__fish_seen_subcommand_from duid' -a 'show' -d 'Alias for list'
complete -c spoofd -n '__fish_seen_subcommand_from duid' -a 'randomize' -d 'Generate and set a random DUID'
complete -c spoofd -n '__fish_seen_subcommand_from duid' -a 'set' -d 'Set specific DUID'
complete -c spoofd -n '__fish_seen_subcommand_from duid' -a 'sync' -d 'Sync DUID to current MAC address'
complete -c spoofd -n '__fish_seen_subcommand_from duid' -a 'restore' -d 'Restore original DUID'
complete -c spoofd -n '__fish_seen_subcommand_from duid' -a 'reset' -d 'Reset DUID to system default'
complete -c spoofd -n '__fish_seen_subcommand_from duid' -a 'generate' -d 'Generate a DUID without setting it'
complete -c spoofd -n '__fish_seen_subcommand_from duid' -a 'original' -d 'Manage original DUID backup'
complete -c spoofd -n '__fish_seen_subcommand_from duid' -a 'help' -d 'Show DUID command help'

# DUID options
complete -c spoofd -n '__fish_seen_subcommand_from duid' -l type -d 'DUID type (LLT, EN, LL, UUID)'
complete -c spoofd -n '__fish_seen_subcommand_from duid' -s i -l interface -d 'Network interface name'

# DUID randomize, set, sync, original commands
complete -c spoofd -n '__fish_seen_subcommand_from duid; and __fish_seen_subcommand_from randomize set sync original' -a '(__spoofd_get_interfaces)'
