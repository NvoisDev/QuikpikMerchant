import { useState, useEffect, useMemo } from 'react';
import { debounce } from '@/utils/performance';

export function useDebounceSearch(initialValue: string = '', delay: number = 300) {
  const [searchValue, setSearchValue] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);

  const debouncedSetValue = useMemo(
    () => debounce((value: string) => setDebouncedValue(value), delay),
    [delay]
  );

  useEffect(() => {
    debouncedSetValue(searchValue);
  }, [searchValue, debouncedSetValue]);

  return {
    searchValue,
    debouncedValue,
    setSearchValue
  };
}