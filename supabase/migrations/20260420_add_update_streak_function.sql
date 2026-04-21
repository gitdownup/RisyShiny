-- Create the daily_completion_tracker table for tracking task completions per day
CREATE TABLE IF NOT EXISTS public.daily_completion_tracker (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completion_date DATE NOT NULL,
  task_count INT DEFAULT 1,
  UNIQUE(user_id, completion_date)
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_daily_completion_tracker_user_date 
ON public.daily_completion_tracker(user_id, completion_date);

-- Create the update_streak RPC function
-- This function increments the streak if the user completed any task today
-- Handles the logic: increment if continuing, reset to 1 if new day/first task
-- IMPORTANT: Only increments streak on FIRST task of the day, not on every task completion

CREATE OR REPLACE FUNCTION public.update_streak(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_date DATE;
  yesterday_date DATE;
  yesterday_completion_count INT;
  today_prior_count INT;
  current_streak INT;
  new_streak INT;
BEGIN
  today_date := CURRENT_DATE;
  yesterday_date := today_date - INTERVAL '1 day';
  
  -- Check today's existing count BEFORE upserting
  SELECT task_count INTO today_prior_count
  FROM public.daily_completion_tracker
  WHERE user_id = p_user_id AND completion_date = today_date;
  
  -- Record today's completion
  INSERT INTO public.daily_completion_tracker (user_id, completion_date, task_count)
  VALUES (p_user_id, today_date, 1)
  ON CONFLICT (user_id, completion_date)
  DO UPDATE SET task_count = daily_completion_tracker.task_count + 1;
  
  -- If today already had tasks, streak was already updated this day — do nothing
  IF today_prior_count IS NOT NULL AND today_prior_count > 0 THEN
    SELECT streak INTO current_streak FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(current_streak, 0);
  END IF;
  
  -- First task of the day: compute new streak
  SELECT streak INTO current_streak FROM public.profiles WHERE id = p_user_id;
  IF current_streak IS NULL THEN
    current_streak := 0;
  END IF;
  
  -- Check if user had any task completions yesterday
  SELECT task_count INTO yesterday_completion_count
  FROM public.daily_completion_tracker
  WHERE user_id = p_user_id AND completion_date = yesterday_date;
  
  -- Determine new streak value
  IF yesterday_completion_count IS NOT NULL AND yesterday_completion_count > 0 THEN
    -- User completed tasks yesterday, so increment the streak
    new_streak := current_streak + 1;
  ELSE
    -- User didn't complete tasks yesterday (or no data), start/restart streak at 1
    new_streak := 1;
  END IF;
  
  -- Update the streak
  UPDATE public.profiles
  SET streak = new_streak,
      updated_at = NOW()
  WHERE id = p_user_id;
  
  RETURN new_streak;
END;
$$;

-- Function to check and reset broken streaks
-- Call this when a user opens the app to handle the case where they didn't complete any tasks yesterday
CREATE OR REPLACE FUNCTION public.check_and_reset_broken_streak(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_date DATE;
  yesterday_date DATE;
  yesterday_completion_count INT;
  current_streak INT;
BEGIN
  today_date := CURRENT_DATE;
  yesterday_date := today_date - INTERVAL '1 day';
  
  -- Get yesterday's completion count
  SELECT task_count INTO yesterday_completion_count
  FROM public.daily_completion_tracker
  WHERE user_id = p_user_id AND completion_date = yesterday_date;
  
  -- Get current streak
  SELECT streak INTO current_streak
  FROM public.profiles
  WHERE id = p_user_id;
  
  IF current_streak IS NULL THEN
    current_streak := 0;
  END IF;
  
  -- If user didn't complete any tasks yesterday AND has an active streak, reset it to 0
  IF yesterday_completion_count IS NULL AND current_streak > 0 THEN
    UPDATE public.profiles
    SET streak = 0,
        updated_at = NOW()
    WHERE id = p_user_id;
    RETURN 0;
  END IF;
  
  -- Return current streak
  RETURN COALESCE(current_streak, 0);
END;
$$;
