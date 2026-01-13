# Zsh completion script for spoofy
# Add to your .zshrc:
#   fpath=(/path/to/completions $fpath)
#   autoload -U compinit && compinit
# Or install globally:
#   sudo cp completions/spoofy.zsh /usr/local/share/zsh/site-functions/_spoofy

#compdef spoofy

_spoofy() {
  local -a commands duid_commands options duid_options

  commands=(
    'list:List available network interfaces'
    'ls:Alias for list'
    'set:Set device MAC address'
    'randomize:Set device MAC address randomly'
    'reset:Reset device MAC address to default'
    'normalize:Normalize a MAC address format'
    'info:Show detailed interface information'
    'validate:Validate MAC address format'
    'vendor:Look up vendor from MAC address'
    'batch:Change multiple interfaces from config file'
    'history:View MAC address change history'
    'duid:DHCPv6 DUID spoofing commands'
    'help:Show help message'
    'version:Show package version'
  )

  duid_commands=(
    'list:Show current DUID'
    'show:Alias for list'
    'randomize:Generate and set a random DUID'
    'set:Set specific DUID'
    'sync:Sync DUID to current MAC address'
    'restore:Restore original DUID'
    'reset:Reset DUID to system default'
    'generate:Generate a DUID without setting it'
    'original:Manage original DUID backup'
    'help:Show DUID command help'
  )

  options=(
    '--wifi:Show only wireless interfaces'
    '--local:Set locally administered flag on randomized MACs'
    '--verbose:Show verbose output'
    '-V:Show verbose output'
    '--json:Output results in JSON format'
    '-j:Output results in JSON format'
    '--version:Show version'
    '-v:Show version'
    '--help:Show help'
    '-h:Show help'
  )

  duid_options=(
    '--type:DUID type (LLT, EN, LL, UUID)'
    '--interface:Network interface name'
    '-i:Network interface name'
  )

  local context state line
  local -a args

  _arguments -C \
    "1: :->command" \
    "*::arg:->args"

  case $state in
    command)
      _describe 'command' commands
      ;;
    args)
      case $words[1] in
        duid)
          if (( CURRENT == 2 )); then
            _describe 'duid command' duid_commands
          else
            case $words[2] in
              randomize|set|sync|original)
                if [[ $words[CURRENT-1] == --interface ]] || [[ $words[CURRENT-1] == -i ]] || (( CURRENT == 3 )); then
                  _get_interfaces
                elif [[ $words[CURRENT] == --* ]]; then
                  _describe 'option' duid_options
                fi
                ;;
              set)
                if (( CURRENT == 3 )) && [[ $words[CURRENT] != --* ]]; then
                  _files
                elif [[ $words[CURRENT] == --* ]]; then
                  _describe 'option' duid_options
                fi
                ;;
              *)
                if [[ $words[CURRENT] == --* ]]; then
                  _describe 'option' duid_options
                fi
                ;;
            esac
          fi
          ;;
        set)
          if (( CURRENT == 2 )); then
            _files
          elif (( CURRENT >= 3 )); then
            _get_interfaces
          fi
          ;;
        randomize|reset|info)
          if [[ $words[CURRENT] == --* ]]; then
            _describe 'option' options
          else
            _get_interfaces
          fi
          ;;
        normalize|validate|vendor)
          if [[ $words[CURRENT] == --* ]]; then
            _describe 'option' options
          else
            _files
          fi
          ;;
        batch)
          if [[ $words[CURRENT] == --* ]]; then
            _describe 'option' options
          else
            _files
          fi
          ;;
        list|ls|history|help|version)
          if [[ $words[CURRENT] == --* ]] || [[ $words[CURRENT] == -* ]]; then
            _describe 'option' options
          fi
          ;;
        *)
          if [[ $words[CURRENT] == --* ]] || [[ $words[CURRENT] == -* ]]; then
            _describe 'option' options
          else
            _files
          fi
          ;;
      esac
      ;;
  esac
}

_get_interfaces() {
  local -a interfaces
  if command -v spoofy >/dev/null 2>&1; then
    interfaces=(${(f)"$(spoofy list --json 2>/dev/null | grep -o '"device":"[^"]*"' | cut -d'"' -f4 2>/dev/null)"})
  fi
  if (( ${#interfaces} > 0 )); then
    _describe 'interface' interfaces
  else
    _files
  fi
}

_spoofy "$@"
