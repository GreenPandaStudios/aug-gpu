#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#include "aug_gpu.h"
#include <pthread.h>
#include <stdatomic.h>
#include <float.h>
#include <limits.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
struct aug_gpu_device_v1 { id<MTLDevice> device; id<MTLCommandQueue> queue; id<MTLComputePipelineState> add; pthread_t owner; };
struct aug_gpu_buffer_v1 { id<MTLBuffer> buffer; aug_gpu_device_v1 *context; uint64_t count; };
static atomic_llong live;
static int32_t error(aug_native_error_v1 *out, int32_t code, const char *message) {
  if (out) { out->code = code; out->message_length = (uint32_t)strnlen(message, sizeof(out->message)); memcpy(out->message, message, out->message_length); }
  return code;
}
static int32_t exception(aug_native_error_v1 *out, NSException *value) { return error(out, 6, [[value reason] UTF8String] ?: "Metal exception"); }
static int32_t owned(const aug_gpu_device_v1 *context, aug_native_error_v1 *out) {
  return context && pthread_equal(context->owner, pthread_self()) ? 0 : error(out, 2, "GPU resources must be used on their creating worker");
}
int32_t aug_gpu_open_v1(aug_gpu_device_v1 **out, aug_native_error_v1 *failure) {
  if (!out) return error(failure, 2, "Missing output"); *out = NULL;
  id<MTLDevice> device = nil; id<MTLLibrary> library = nil; id<MTLFunction> function = nil;
  id<MTLComputePipelineState> pipeline = nil; id<MTLCommandQueue> queue = nil;
  @autoreleasepool { @try {
    device = MTLCreateSystemDefaultDevice();
    if (!device) return error(failure, 1, "No Metal GPU is available; this package has no CPU fallback");
    NSError *cause = nil;
    NSString *source = @"#include <metal_stdlib>\nusing namespace metal;\nkernel void august_add(device const float* a [[buffer(0)]], device const float* b [[buffer(1)]], device float* c [[buffer(2)]], uint i [[thread_position_in_grid]]) { c[i] = a[i] + b[i]; }";
    library = [device newLibraryWithSource:source options:nil error:&cause];
    function = [library newFunctionWithName:@"august_add"];
    pipeline = function ? [device newComputePipelineStateWithFunction:function error:&cause] : nil;
    queue = [device newCommandQueue]; [function release]; function = nil; [library release]; library = nil;
    if (!pipeline || !queue) { int32_t code = error(failure, 3, [[cause localizedDescription] UTF8String] ?: "Cannot create Metal pipeline"); [pipeline release]; [queue release]; [device release]; return code; }
    aug_gpu_device_v1 *context = calloc(1, sizeof(*context));
    if (!context) { [pipeline release]; [queue release]; [device release]; return error(failure, 4, "Out of memory"); }
    context->device = device; context->queue = queue; context->add = pipeline; context->owner = pthread_self(); *out = context; atomic_fetch_add(&live, 1); return 0;
  } @catch(NSException *cause) { [function release]; [library release]; [pipeline release]; [queue release]; [device release]; return exception(failure, cause); } }
}
static aug_gpu_buffer_v1 *buffer(const aug_gpu_device_v1 *context, uint64_t count) {
  if (count > UINT32_MAX || count > SIZE_MAX / sizeof(float)) return NULL;
  aug_gpu_buffer_v1 *value = calloc(1, sizeof(*value)); if (!value) return NULL;
  value->context = calloc(1, sizeof(*value->context));
  if (!value->context) { free(value); return NULL; }
  @try {
    value->buffer = [context->device newBufferWithLength:(NSUInteger)(count ? count * sizeof(float) : sizeof(float)) options:MTLResourceStorageModeShared];
  } @catch(NSException *cause) { free(value->context); free(value); @throw cause; }
  if (!value->buffer) { free(value->context); free(value); return NULL; }
  /* Buffers retain only native context objects, never another worker's heap. */
  *value->context = *context; [context->device retain]; [context->queue retain]; [context->add retain];
  value->count = count; atomic_fetch_add(&live, 2); return value;
}
int32_t aug_gpu_upload_v1(const aug_gpu_device_v1 *context, const double *values, uint64_t count, aug_gpu_buffer_v1 **out, aug_native_error_v1 *failure) {
  if (!out) return error(failure, 2, "Missing output"); *out = NULL;
  int32_t status = owned(context, failure); if (status) return status;
  if (count > UINT32_MAX || count > SIZE_MAX / sizeof(float) || count * sizeof(float) > context->device.maxBufferLength) return error(failure, 2, "GPU buffer exceeds the device or index limit");
  if (count && !values) return error(failure, 2, "Missing values");
  for (uint64_t i = 0; i < count; i++) if (!isfinite(values[i]) || fabs(values[i]) > FLT_MAX) return error(failure, 2, "GPU values must be finite float32 numbers");
  aug_gpu_buffer_v1 *result = NULL;
  @autoreleasepool { @try {
    result = buffer(context, count); if (!result) return error(failure, 4, "Cannot allocate GPU buffer");
    float *contents = [result->buffer contents]; for (uint64_t i = 0; i < count; i++) contents[i] = (float)values[i]; *out = result; return 0;
  } @catch(NSException *cause) { if (result) aug_gpu_buffer_release_v1(result); return exception(failure, cause); } }
}
int32_t aug_gpu_add_v1(const aug_gpu_buffer_v1 *left, const aug_gpu_buffer_v1 *right, aug_gpu_buffer_v1 **out, aug_native_error_v1 *failure) {
  if (!out) return error(failure, 2, "Missing output"); *out = NULL;
  if (!left || !right) return error(failure, 2, "Missing buffer");
  int32_t status = owned(left->context, failure); if (status) return status; status = owned(right->context, failure); if (status) return status;
  if (left->count != right->count || left->context->device != right->context->device) return error(failure, 2, "GPU buffers need the same length and device");
  aug_gpu_buffer_v1 *result = NULL;
  @autoreleasepool { @try {
    result = buffer(left->context, left->count); if (!result) return error(failure, 4, "Cannot allocate GPU output");
    if (left->count) {
      id<MTLCommandBuffer> commands = [left->context->queue commandBuffer];
      id<MTLComputeCommandEncoder> encoder = [commands computeCommandEncoder];
      if (!commands || !encoder) { aug_gpu_buffer_release_v1(result); return error(failure, 3, "Cannot encode GPU operation"); }
      [encoder setComputePipelineState:left->context->add];
      [encoder setBuffer:left->buffer offset:0 atIndex:0]; [encoder setBuffer:right->buffer offset:0 atIndex:1]; [encoder setBuffer:result->buffer offset:0 atIndex:2];
      NSUInteger width = MIN(left->context->add.threadExecutionWidth, (NSUInteger)left->count);
      [encoder dispatchThreads:MTLSizeMake((NSUInteger)left->count, 1, 1) threadsPerThreadgroup:MTLSizeMake(width, 1, 1)];
      [encoder endEncoding]; [commands commit]; [commands waitUntilCompleted];
      if (commands.status != MTLCommandBufferStatusCompleted) { int32_t code = error(failure, 5, [[commands.error localizedDescription] UTF8String] ?: "GPU execution failed"); aug_gpu_buffer_release_v1(result); return code; }
    }
    *out = result; return 0;
  } @catch(NSException *cause) { if (result) aug_gpu_buffer_release_v1(result); return exception(failure, cause); } }
}
int32_t aug_gpu_download_v1(const aug_gpu_buffer_v1 *value, double **out, uint64_t *count, aug_native_error_v1 *failure) {
  if (!out || !count) return error(failure, 2, "Missing output"); *out = NULL; *count = 0;
  if (!value) return error(failure, 2, "Missing buffer"); int32_t status = owned(value->context, failure); if (status) return status;
  if (value->count > SIZE_MAX / sizeof(double)) return error(failure, 4, "Output is too large");
  double *result = NULL;
  @autoreleasepool { @try {
    result = malloc((size_t)(value->count ? value->count : 1) * sizeof(double)); if (!result) return error(failure, 4, "Out of memory");
    const float *contents = [value->buffer contents]; for (uint64_t i = 0; i < value->count; i++) result[i] = contents[i];
    *out = result; *count = value->count; return 0;
  } @catch(NSException *cause) { free(result); return exception(failure, cause); } }
}
void aug_gpu_device_release_v1(aug_gpu_device_v1 *value) {
  if (!value) return; if (!pthread_equal(value->owner, pthread_self())) abort();
  @autoreleasepool { [value->add release]; [value->queue release]; [value->device release]; free(value); atomic_fetch_sub(&live, 1); }
}
void aug_gpu_buffer_release_v1(aug_gpu_buffer_v1 *value) {
  if (!value) return; if (!pthread_equal(value->context->owner, pthread_self())) abort();
  @autoreleasepool { [value->buffer release]; aug_gpu_device_release_v1(value->context); free(value); atomic_fetch_sub(&live, 1); }
}
void aug_gpu_values_release_v1(double *values) { free(values); }
int64_t aug_gpu_live_resources_v1(void) { return atomic_load(&live); }
