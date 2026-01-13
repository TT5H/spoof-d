# PowerShell completion script for spoofy
# Add to your PowerShell profile ($PROFILE):
#   . /path/to/completions/spoofy.ps1
# Or install globally:
#   Copy to: $PSHOME\Modules\spoofy\spoofy.ps1

Register-ArgumentCompleter -Native -CommandName spoofy -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $commands = @(
        'list', 'ls', 'set', 'randomize', 'reset', 'normalize',
        'info', 'validate', 'vendor', 'batch', 'history', 'duid',
        'help', 'version'
    )

    $duidCommands = @(
        'list', 'show', 'randomize', 'set', 'sync', 'restore',
        'reset', 'generate', 'original', 'help'
    )

    $options = @(
        '--wifi', '--local', '--verbose', '-V', '--json', '-j',
        '--version', '-v', '--help', '-h'
    )

    $duidOptions = @(
        '--type', '--interface', '-i'
    )

    $duidTypes = @('LLT', 'EN', 'LL', 'UUID')

    # Get current command tokens
    $tokens = $commandAst.CommandElements
    $tokenCount = $tokens.Count

    # Helper function to get network interfaces
    function Get-Interfaces {
        try {
            $output = spoofy list --json 2>$null | ConvertFrom-Json
            if ($output.interfaces) {
                return $output.interfaces | ForEach-Object { $_.device }
            }
        } catch {
            # Fallback: return common interface names
            return @('Ethernet', 'Wi-Fi', 'Local Area Connection', 'Wireless Network Connection')
        }
        return @()
    }

    # If no command specified yet
    if ($tokenCount -eq 1) {
        return $commands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }

    $mainCommand = $tokens[1].Value

    # Handle DUID subcommands
    if ($mainCommand -eq 'duid') {
        if ($tokenCount -eq 2) {
            # Complete DUID subcommand
            return $duidCommands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
            }
        }

        $duidCommand = $tokens[2].Value
        $prevToken = if ($tokenCount -gt 2) { $tokens[$tokenCount - 1].Value } else { $null }

        # Handle DUID command-specific completions
        switch ($duidCommand) {
            { $_ -in 'randomize', 'set', 'sync', 'original' } {
                if ($prevToken -in '--interface', '-i' -or ($tokenCount -eq 3 -and $wordToComplete -notlike '--*')) {
                    return Get-Interfaces | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                    }
                } elseif ($wordToComplete -like '--*') {
                    return $duidOptions | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                    }
                }
            }
            'set' {
                if ($tokenCount -eq 3 -and $wordToComplete -notlike '--*') {
                    # DUID value - no completion, just return
                    return
                } elseif ($wordToComplete -like '--*') {
                    return $duidOptions | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                    }
                }
            }
        }

        # Complete DUID options
        if ($wordToComplete -like '--*') {
            $completions = $duidOptions | Where-Object { $_ -like "$wordToComplete*" }
            if ($prevToken -eq '--type') {
                # Complete DUID type
                return $duidTypes | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            }
            return $completions | ForEach-Object {
                [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
            }
        }
        return
    }

    # Handle main command-specific completions
    switch ($mainCommand) {
        'set' {
            if ($tokenCount -eq 2) {
                # MAC address - no completion
                return
            } elseif ($tokenCount -ge 3) {
                # Interface names
                return Get-Interfaces | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            }
        }
        { $_ -in 'randomize', 'reset', 'info' } {
            if ($wordToComplete -like '--*' -or $wordToComplete -like '-*') {
                return $options | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            } else {
                return Get-Interfaces | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            }
        }
        { $_ -in 'normalize', 'validate', 'vendor', 'batch' } {
            if ($wordToComplete -like '--*' -or $wordToComplete -like '-*') {
                return $options | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            }
            # File completion for these commands
            return
        }
        { $_ -in 'list', 'ls', 'history', 'help', 'version' } {
            if ($wordToComplete -like '--*' -or $wordToComplete -like '-*') {
                return $options | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            }
        }
        default {
            if ($wordToComplete -like '--*' -or $wordToComplete -like '-*') {
                return $options | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            }
        }
    }
}
