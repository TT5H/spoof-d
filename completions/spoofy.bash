# Bash completion script for spoofy
# Source this file or add to your .bashrc:
#   source /path/to/completions/spoofy.bash
# Or install globally:
#   sudo cp completions/spoofy.bash /etc/bash_completion.d/spoofy

_spoofy() {
  local cur prev words cword
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  words=("${COMP_WORDS[@]}")

  # Main commands
  local commands="list ls set randomize reset normalize info validate vendor batch history duid help version"
  
  # DUID subcommands
  local duid_commands="list show randomize set sync restore reset generate original help"
  
  # Options
  local options="--wifi --local --verbose -V --json -j --version -v --help -h"
  
  # DUID options
  local duid_options="--type --interface -i"

  # If we're completing the first argument (command)
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=($(compgen -W "${commands}" -- "${cur}"))
    return 0
  fi

  # Handle DUID subcommands
  if [[ "${words[1]}" == "duid" ]]; then
    if [[ ${COMP_CWORD} -eq 2 ]]; then
      COMPREPLY=($(compgen -W "${duid_commands}" -- "${cur}"))
      return 0
    fi
    
    # Handle DUID command-specific completions
    local duid_cmd="${words[2]}"
    
    case "${duid_cmd}" in
      randomize|set|sync|original)
        # These commands take an interface name
        if [[ "${prev}" == "--interface" ]] || [[ "${prev}" == "-i" ]] || [[ ${COMP_CWORD} -eq 3 ]]; then
          # Try to get interface names from system
          local interfaces
          if command -v spoofy >/dev/null 2>&1; then
            interfaces=$(spoofy list --json 2>/dev/null | grep -o '"device":"[^"]*"' | cut -d'"' -f4 2>/dev/null | tr '\n' ' ')
          fi
          if [[ -n "${interfaces}" ]]; then
            COMPREPLY=($(compgen -W "${interfaces}" -- "${cur}"))
          else
            COMPREPLY=($(compgen -f -- "${cur}"))
          fi
        elif [[ "${cur}" == --* ]]; then
          COMPREPLY=($(compgen -W "${duid_options}" -- "${cur}"))
        fi
        ;;
      set)
        # DUID set needs a DUID value
        if [[ ${COMP_CWORD} -eq 3 ]] && [[ "${cur}" != --* ]]; then
          COMPREPLY=($(compgen -f -- "${cur}"))
        elif [[ "${cur}" == --* ]]; then
          COMPREPLY=($(compgen -W "${duid_options}" -- "${cur}"))
        fi
        ;;
      *)
        if [[ "${cur}" == --* ]]; then
          COMPREPLY=($(compgen -W "${duid_options}" -- "${cur}"))
        fi
        ;;
    esac
    return 0
  fi

  # Handle main command-specific completions
  case "${words[1]}" in
    set)
      # set <mac> <device>
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        # MAC address completion (partial)
        COMPREPLY=($(compgen -f -- "${cur}"))
      elif [[ ${COMP_CWORD} -ge 3 ]]; then
        # Interface name completion
        local interfaces
        if command -v spoofy >/dev/null 2>&1; then
          interfaces=$(spoofy list --json 2>/dev/null | grep -o '"device":"[^"]*"' | cut -d'"' -f4 2>/dev/null | tr '\n' ' ')
        fi
        if [[ -n "${interfaces}" ]]; then
          COMPREPLY=($(compgen -W "${interfaces}" -- "${cur}"))
        else
          COMPREPLY=($(compgen -f -- "${cur}"))
        fi
      fi
      ;;
    randomize|reset|info)
      # These commands take interface names
      if [[ "${cur}" == --* ]]; then
        COMPREPLY=($(compgen -W "${options}" -- "${cur}"))
      else
        local interfaces
        if command -v spoofy >/dev/null 2>&1; then
          interfaces=$(spoofy list --json 2>/dev/null | grep -o '"device":"[^"]*"' | cut -d'"' -f4 2>/dev/null | tr '\n' ' ')
        fi
        if [[ -n "${interfaces}" ]]; then
          COMPREPLY=($(compgen -W "${interfaces}" -- "${cur}"))
        else
          COMPREPLY=($(compgen -f -- "${cur}"))
        fi
      fi
      ;;
    normalize|validate|vendor)
      # These commands take a MAC address
      if [[ "${cur}" == --* ]]; then
        COMPREPLY=($(compgen -W "${options}" -- "${cur}"))
      else
        COMPREPLY=($(compgen -f -- "${cur}"))
      fi
      ;;
    batch)
      # batch <file>
      if [[ "${cur}" == --* ]]; then
        COMPREPLY=($(compgen -W "${options}" -- "${cur}"))
      else
        COMPREPLY=($(compgen -f -- "${cur}"))
      fi
      ;;
    list|ls|history|help|version)
      # These commands only take options
      if [[ "${cur}" == --* ]] || [[ "${cur}" == -* ]]; then
        COMPREPLY=($(compgen -W "${options}" -- "${cur}"))
      fi
      ;;
    *)
      # Default: complete with options or files
      if [[ "${cur}" == --* ]] || [[ "${cur}" == -* ]]; then
        COMPREPLY=($(compgen -W "${options}" -- "${cur}"))
      else
        COMPREPLY=($(compgen -f -- "${cur}"))
      fi
      ;;
  esac

  return 0
}

complete -F _spoofy spoofy
