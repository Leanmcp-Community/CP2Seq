#!/usr/bin/env python3
"""Package code, released dataset and analyses, excluding all raw run directories."""
from package_supplement import main

if __name__ == '__main__':
    main(include_runs=False)
